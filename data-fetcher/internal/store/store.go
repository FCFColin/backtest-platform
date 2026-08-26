// Package store 提供 data-fetcher 的 PostgreSQL 数据存储层。
package store

import (
	"context"
	"crypto/tls"
	"data-fetcher/internal/provider"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"os"
	"sort"
	"time"
)

type PricePoint struct {
	Date        string   `json:"date"`
	Open        float64  `json:"open"`
	High        float64  `json:"high"`
	Low         float64  `json:"low"`
	Close       float64  `json:"close"`
	AdjClose    *float64 `json:"adjusted_close"` // R-12/A4：nil=未确认复权，JSON null 由消费端 ?? close 兜底
	Volume      int64    `json:"volume"`
	Dividend    float64  `json:"dividend"`
	SplitFactor float64  `json:"split_factor"`
}
type SearchResult struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}
type CPIEntry struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type DataStore struct {
	pool *pgxpool.Pool
	reg  *provider.Registry
}

// ErrDBQuery 区分基础设施故障（→500）与数据不存在（→404），避免 DB 故障被误报为缺失 ticker。
var ErrDBQuery = fmt.Errorf("db query failed")

// ErrProviderUnavailable 表示实时数据源抓取失败（上游宕机/超时），区别于"标的不存在"（→503+degraded）。
var ErrProviderUnavailable = fmt.Errorf("provider fetch failed")

func New(ctx context.Context, databaseURL string, reg *provider.Registry) (*DataStore, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 未设置")
	}
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("解析 DATABASE_URL 失败: %w", err)
	}
	poolCfg.MaxConns = 10
	if os.Getenv("NODE_ENV") == "production" {
		if poolCfg.ConnConfig.TLSConfig == nil {
			poolCfg.ConnConfig.TLSConfig = &tls.Config{ServerName: poolCfg.ConnConfig.Host}
		}
		poolCfg.ConnConfig.TLSConfig.InsecureSkipVerify = false
		slog.Info("PostgreSQL TLS 已启用（生产环境强制）", "module", "数据存储")
	}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("数据库 Ping 失败: %w", err)
	}
	slog.Info("数据存储初始化完成", "module", "数据存储")
	return &DataStore{pool: pool, reg: reg}, nil
}
func (ds *DataStore) Pool() *pgxpool.Pool {
	return ds.pool
}
func (ds *DataStore) GetPriceData(ctx context.Context, ticker, startDate, endDate string) ([]PricePoint, bool, error) {
	query := `SELECT date, open, high, low, close, volume, adjusted_close FROM prices WHERE ticker = $1`
	args := []interface{}{ticker}
	argIdx := 2
	if startDate != "" {
		query += fmt.Sprintf(" AND date >= $%d", argIdx)
		args = append(args, startDate)
		argIdx++
	}
	if endDate != "" {
		query += fmt.Sprintf(" AND date <= $%d", argIdx)
		args = append(args, endDate)
	}
	query += " ORDER BY date"
	rows, err := ds.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("%w: 查询价格数据失败: %v", ErrDBQuery, err)
	}
	defer rows.Close()
	var prices []PricePoint
	for rows.Next() {
		var p PricePoint
		var date time.Time
		var adjClose *float64
		if err := rows.Scan(&date, &p.Open, &p.High, &p.Low, &p.Close, &p.Volume, &adjClose); err != nil {
			return nil, false, fmt.Errorf("%w: 扫描价格行失败: %v", ErrDBQuery, err)
		}
		p.Date = date.Format("2006-01-02")
		p.AdjClose = adjClose // R-12/A4：DB NULL 直通 *float64 nil，JSON 序列化为 null
		prices = append(prices, p)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("%w: 迭代价格行失败: %v", ErrDBQuery, err)
	}
	if len(prices) > 0 {
		return prices, false, nil
	}
	fetchedPrices, err := ds.RefreshPriceData(ctx, ticker, startDate, endDate)
	if err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			return nil, false, err
		}
		return nil, false, fmt.Errorf("标的数据不存在: %s", ticker)
	}
	return fetchedPrices, true, nil
}

// RefreshPriceData 总是从 provider 实时抓取并回写 DB，供数据更新任务（batch 刷新）使用；
// 区别于 GetPriceData 的"DB 优先、缺数据才实时抓取"降级语义。
func (ds *DataStore) RefreshPriceData(ctx context.Context, ticker, startDate, endDate string) ([]PricePoint, error) {
	startDate, endDate = defaultDateRange(startDate, endDate)
	fetchedPrices, err := ds.fetchAndStoreFromProvider(ctx, ticker, startDate, endDate)
	if err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			return nil, err
		}
		return nil, fmt.Errorf("标的数据不存在: %s", ticker)
	}
	return filterPricePointsByDate(fetchedPrices, startDate, endDate), nil
}
func defaultDateRange(startDate, endDate string) (string, string) {
	if startDate == "" {
		startDate = "2000-01-01"
	}
	if endDate == "" {
		endDate = time.Now().Format("2006-01-02")
	}
	return startDate, endDate
}
func filterPricePointsByDate(prices []PricePoint, startDate, endDate string) []PricePoint {
	var filtered []PricePoint
	for _, p := range prices {
		if startDate != "" && p.Date < startDate {
			continue
		}
		if endDate != "" && p.Date > endDate {
			continue
		}
		filtered = append(filtered, p)
	}
	return filtered
}
func (ds *DataStore) fetchAndStoreFromProvider(ctx context.Context, ticker, startDate, endDate string) ([]PricePoint, error) {
	providers := ds.reg.ForTicker(ticker)
	if len(providers) == 0 {
		return nil, fmt.Errorf("%w: 没有可用的数据源: %s", ErrProviderUnavailable, ticker)
	}
	goStart, goEnd := defaultDateRange(startDate, endDate)
	dailyPrices, providerName, err := provider.FetchWithFallback(providers, ticker, goStart, goEnd)
	if err != nil {
		if errors.Is(err, provider.ErrAllProvidersEmpty) {
			return nil, fmt.Errorf("标的数据不存在: %s", ticker)
		}
		return nil, fmt.Errorf("%w: 从 provider 获取 %s 失败: %v", ErrProviderUnavailable, ticker, err)
	}
	if len(dailyPrices) == 0 {
		slog.Warn("provider 无数据返回", "ticker", ticker, "provider", providerName)
		return nil, fmt.Errorf("provider 无数据返回: %s", ticker)
	}
	slog.Info("从 provider 实时获取数据成功", "ticker", ticker, "provider", providerName, "count", len(dailyPrices))
	// 返回给调用方与落库共用同一份净化数据，避免读路径透出与 DB CHECK 不一致的脏值
	dailyPrices = provider.SanitizePrices(dailyPrices)
	if err := ds.writeGoPricesToDB(ctx, ticker, dailyPrices); err != nil {
		slog.Warn("写入数据库失败（不影响返回）", "ticker", ticker, "error", err)
	}
	pricePoints := make([]PricePoint, len(dailyPrices))
	for i, dp := range dailyPrices {
		var adj *float64 // R-12/A4：nil 直通 pgx → adjusted_close 落 NULL，消费端走 ?? close 兜底
		if dp.AdjustedClose != nil {
			adj = dp.AdjustedClose
		}
		pricePoints[i] = PricePoint{
			Date:     dp.Date,
			Open:     dp.Open,
			High:     dp.High,
			Low:      dp.Low,
			Close:    dp.Close,
			AdjClose: adj,
			Volume:   dp.Volume,
		}
	}
	return pricePoints, nil
}
func (ds *DataStore) writeGoPricesToDB(ctx context.Context, ticker string, prices []provider.DailyPrice) error {
	if ds.pool == nil {
		return fmt.Errorf("数据库未连接")
	}
	// 去重：同一批次内按 date 去重，保留最后一次出现（避免 ON CONFLICT 重复队列浪费）
	dedup := make(map[string]provider.DailyPrice, len(prices))
	for _, p := range prices {
		dedup[p.Date] = p
	}
	uniq := make([]provider.DailyPrice, 0, len(dedup))
	for _, p := range dedup {
		uniq = append(uniq, p)
	}
	sort.Slice(uniq, func(i, j int) bool { return uniq[i].Date < uniq[j].Date })
	tx, err := ds.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	batch := &pgx.Batch{}
	batch.Queue(`
		INSERT INTO tickers (ticker) VALUES ($1)
		ON CONFLICT (ticker) DO NOTHING
	`, ticker)
	for _, p := range uniq {
		adjClose := p.AdjustedClose
		batch.Queue(`
			INSERT INTO prices (ticker, date, open, high, low, close, volume, adjusted_close)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (ticker, date) DO UPDATE SET
				open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
				close = EXCLUDED.close, volume = EXCLUDED.volume, adjusted_close = EXCLUDED.adjusted_close
		`, ticker, p.Date, p.Open, p.High, p.Low, p.Close, p.Volume, adjClose)
	}
	br := tx.SendBatch(ctx, batch)
	if _, err := br.Exec(); err != nil {
		br.Close()
		return fmt.Errorf("插入 ticker 失败: %w", err)
	}
	for range uniq {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return fmt.Errorf("写入价格数据失败: %w", err)
		}
	}
	if err := br.Close(); err != nil {
		return fmt.Errorf("批量关闭失败: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	return nil
}
func (ds *DataStore) SearchTickers(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	rows, err := ds.pool.Query(ctx, `
		SELECT ticker, COALESCE(category, '') AS name, COALESCE(market, '') AS market
		FROM tickers
		WHERE ticker ILIKE $1 OR category ILIKE $1
		ORDER BY ticker
		LIMIT $2
	`, "%"+query+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("搜索标的失败: %w", err)
	}
	defer rows.Close()
	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.Ticker, &r.Name, &r.Market); err != nil {
			return nil, fmt.Errorf("扫描搜索结果失败: %w", err)
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("迭代搜索结果失败: %w", err)
	}
	return results, nil
}
func (ds *DataStore) GetCPI(ctx context.Context, country string) ([]CPIEntry, error) {
	rows, err := ds.pool.Query(ctx, `SELECT date, value FROM cpi_data WHERE country = $1 ORDER BY date`, country)
	if err != nil {
		return nil, fmt.Errorf("%w: 查询CPI失败: %v", ErrDBQuery, err)
	}
	defer rows.Close()
	var entries []CPIEntry
	for rows.Next() {
		var e CPIEntry
		var date time.Time
		if err := rows.Scan(&date, &e.Value); err != nil {
			return nil, fmt.Errorf("%w: 扫描CPI行失败: %v", ErrDBQuery, err)
		}
		e.Date = date.Format("2006-01-02")
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ── U-2 Phase 1：无风险利率序列（treasury_rates）─────────────────────

// TreasuryRate 单日利率观测（小数形式）。
type TreasuryRate struct {
	Date string  `json:"date"`
	Rate float64 `json:"rate"`
}

// UpsertTreasuryRates 批量写入/更新利率观测（FRED 拉取后落库）。
func (ds *DataStore) UpsertTreasuryRates(ctx context.Context, series string, points []TreasuryRate) (int64, error) {
	// 过滤负利率脏值（FRED 极端回报可能为 "-" 解析为 0，已在 provider 层丢弃；此处再防）
	filtered := make([]TreasuryRate, 0, len(points))
	for _, p := range points {
		if p.Rate < 0 {
			slog.Warn("跳过负利率脏值", "series", series, "date", p.Date, "rate", p.Rate)
			continue
		}
		filtered = append(filtered, p)
	}
	if len(filtered) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, p := range filtered {
		batch.Queue(
			`INSERT INTO treasury_rates (series, date, rate) VALUES ($1, $2, $3)
			 ON CONFLICT (series, date) DO UPDATE SET rate = EXCLUDED.rate`,
			series, p.Date, p.Rate,
		)
	}
	br := ds.pool.SendBatch(ctx, batch)
	defer br.Close()
	var n int64
	for range filtered {
		ct, err := br.Exec()
		if err != nil {
			return n, fmt.Errorf("%w: 利率写入失败: %v", ErrDBQuery, err)
		}
		n += ct.RowsAffected()
	}
	return n, nil
}

// GetTreasuryRates 读取区间内利率序列（升序）。
func (ds *DataStore) GetTreasuryRates(ctx context.Context, series, start, end string) ([]TreasuryRate, error) {
	rows, err := ds.pool.Query(ctx,
		`SELECT date, rate FROM treasury_rates WHERE series = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
		series, start, end)
	if err != nil {
		return nil, fmt.Errorf("%w: 查询利率失败: %v", ErrDBQuery, err)
	}
	defer rows.Close()
	out := make([]TreasuryRate, 0)
	for rows.Next() {
		var r TreasuryRate
		var d time.Time
		if err := rows.Scan(&d, &r.Rate); err != nil {
			return nil, fmt.Errorf("%w: 扫描利率行失败: %v", ErrDBQuery, err)
		}
		r.Date = d.Format("2006-01-02")
		out = append(out, r)
	}
	return out, rows.Err()
}
