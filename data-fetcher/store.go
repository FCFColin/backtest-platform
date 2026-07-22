package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"data-fetcher/internal/provider"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ============================================================
// 数据结构
// ============================================================

type PricePoint struct {
	Date        string  `json:"date"`
	Open        float64 `json:"open"`
	High        float64 `json:"high"`
	Low         float64 `json:"low"`
	Close       float64 `json:"close"`
	AdjClose    float64 `json:"adjusted_close"`
	Volume      int64   `json:"volume"`
	Dividend    float64 `json:"dividend"`
	SplitFactor float64 `json:"split_factor"`
}

type SearchResult struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

// ============================================================
// 数据存储（PostgreSQL）
// ============================================================

type DataStore struct {
	pool *pgxpool.Pool
}

func NewDataStore(ctx context.Context, cfg *Config) (*DataStore, error) {
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 未设置")
	}
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("解析 DATABASE_URL 失败: %w", err)
	}
	poolCfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("数据库 Ping 失败: %w", err)
	}

	slog.Info("数据存储初始化完成", "module", "数据存储")
	return &DataStore{pool: pool}, nil
}

func (ds *DataStore) GetPriceData(ctx context.Context, ticker, startDate, endDate string) ([]PricePoint, error) {
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
		return nil, fmt.Errorf("查询价格数据失败: %w", err)
	}
	defer rows.Close()

	var prices []PricePoint
	for rows.Next() {
		var p PricePoint
		var date time.Time
		var adjClose *float64
		if err := rows.Scan(&date, &p.Open, &p.High, &p.Low, &p.Close, &p.Volume, &adjClose); err != nil {
			return nil, fmt.Errorf("扫描价格行失败: %w", err)
		}
		p.Date = date.Format("2006-01-02")
		if adjClose != nil {
			p.AdjClose = *adjClose
		}
		prices = append(prices, p)
	}

	if len(prices) > 0 {
		return prices, nil
	}

	if startDate == "" {
		startDate = "2000-01-01"
	}
	if endDate == "" {
		endDate = time.Now().Format("2006-01-02")
	}

	fetchedPrices, err := ds.fetchAndStoreFromProvider(ctx, ticker, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("标的数据不存在: %s", ticker)
	}

	return filterPricePointsByDate(fetchedPrices, startDate, endDate), nil
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
	providers := dataReg.ForTicker(ticker)
	if len(providers) == 0 {
		return nil, fmt.Errorf("没有可用的数据源: %s", ticker)
	}

	goStart := startDate
	if goStart == "" {
		goStart = "2000-01-01"
	}
	goEnd := endDate
	if goEnd == "" {
		goEnd = time.Now().Format("2006-01-02")
	}

	dailyPrices, providerName, err := provider.FetchWithFallback(providers, ticker, goStart, goEnd)
	if err != nil {
		return nil, fmt.Errorf("从 provider 获取 %s 失败: %w", ticker, err)
	}

	if len(dailyPrices) == 0 {
		slog.Warn("provider 无数据返回", "ticker", ticker, "provider", providerName)
		return nil, fmt.Errorf("provider 无数据返回: %s", ticker)
	}

	slog.Info("从 provider 实时获取数据成功", "ticker", ticker, "provider", providerName, "count", len(dailyPrices))

	if err := ds.writeGoPricesToDB(ctx, ticker, dailyPrices); err != nil {
		slog.Warn("写入数据库失败（不影响返回）", "ticker", ticker, "error", err)
	}

	pricePoints := make([]PricePoint, len(dailyPrices))
	for i, dp := range dailyPrices {
		pricePoints[i] = PricePoint{
			Date:     dp.Date,
			Open:     dp.Open,
			High:     dp.High,
			Low:      dp.Low,
			Close:    dp.Close,
			AdjClose: dp.AdjustedClose,
			Volume:   dp.Volume,
		}
	}

	return pricePoints, nil
}

func (ds *DataStore) writeGoPricesToDB(ctx context.Context, ticker string, prices []provider.DailyPrice) error {
	if ds.pool == nil {
		return fmt.Errorf("数据库未连接")
	}

	batch := &pgx.Batch{}

	batch.Queue(`
		INSERT INTO tickers (ticker) VALUES ($1)
		ON CONFLICT (ticker) DO NOTHING
	`, ticker)

	for _, p := range prices {
		adjClose := p.AdjustedClose
		batch.Queue(`
			INSERT INTO prices (ticker, date, open, high, low, close, volume, adjusted_close)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (ticker, date) DO UPDATE SET
				open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
				close = EXCLUDED.close, volume = EXCLUDED.volume, adjusted_close = EXCLUDED.adjusted_close
		`, ticker, p.Date, p.Open, p.High, p.Low, p.Close, p.Volume, adjClose)
	}

	br := ds.pool.SendBatch(ctx, batch)
	defer br.Close()

	if _, err := br.Exec(); err != nil {
		return fmt.Errorf("插入 ticker 失败: %w", err)
	}

	for range prices {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("写入价格数据失败: %w", err)
		}
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
	return results, nil
}

func (ds *DataStore) BatchValidateTickers(ctx context.Context, tickers []string) (valid []string, invalid []string, err error) {
	if len(tickers) == 0 {
		return nil, nil, nil
	}

	rows, err := ds.pool.Query(ctx, `
		SELECT DISTINCT ticker FROM prices WHERE ticker = ANY($1)
	`, tickers)
	if err != nil {
		return nil, nil, fmt.Errorf("校验标的失败: %w", err)
	}
	defer rows.Close()

	validSet := make(map[string]bool, len(tickers))
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, nil, fmt.Errorf("扫描校验结果失败: %w", err)
		}
		validSet[t] = true
	}

	valid = make([]string, 0, len(tickers))
	invalid = make([]string, 0)
	for _, t := range tickers {
		if validSet[t] {
			valid = append(valid, t)
		} else {
			invalid = append(invalid, t)
		}
	}
	return
}
