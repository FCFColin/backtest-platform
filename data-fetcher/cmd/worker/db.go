package main

import (
	"context"
	"data-fetcher/internal/provider"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
)

func initDB(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 未设置")
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("解析 DATABASE_URL 失败: %w", err)
	}
	config.MaxConns = 5
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("数据库 Ping 失败: %w", err)
	}
	if err := ensureSchema(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("初始化 schema 失败: %w", err)
	}
	return pool, nil
}
func ensureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	schema := `
	CREATE TABLE IF NOT EXISTS prices (
		ticker TEXT NOT NULL,
		date   DATE NOT NULL,
		open   DOUBLE PRECISION,
		high   DOUBLE PRECISION,
		low    DOUBLE PRECISION,
		close  DOUBLE PRECISION,
		volume BIGINT,
		adjusted_close DOUBLE PRECISION,
		PRIMARY KEY (ticker, date)
	);
	CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices (ticker, date);
	CREATE TABLE IF NOT EXISTS tickers (
		ticker TEXT PRIMARY KEY,
		category TEXT NOT NULL DEFAULT '',
		market TEXT NOT NULL DEFAULT '',
		exchange TEXT NOT NULL DEFAULT ''
	);
	CREATE TABLE IF NOT EXISTS worker_progress (
		ticker   TEXT PRIMARY KEY,
		last_date DATE,
		updated_at  TIMESTAMP DEFAULT NOW()
	);
	`
	_, err := pool.Exec(ctx, schema)
	return err
}
func loadTickerList(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	if pool == nil {
		return nil, fmt.Errorf("数据库未连接")
	}
	rows, err := pool.Query(ctx, "SELECT ticker FROM tickers ORDER BY ticker")
	if err != nil {
		return nil, fmt.Errorf("查询标的列表失败: %w", err)
	}
	defer rows.Close()
	var tickers []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, fmt.Errorf("扫描标的行失败: %w", err)
		}
		tickers = append(tickers, t)
	}
	return tickers, nil
}
func isTickerTableEmpty(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM tickers").Scan(&count); err != nil {
		return false, fmt.Errorf("查询 tickers 表计数失败: %w", err)
	}
	return count == 0, nil
}
func seedUniverse(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return fmt.Errorf("数据库未连接")
	}
	batch := &pgx.Batch{}
	for _, meta := range DefaultETFUniverse {
		batch.Queue(`
			INSERT INTO tickers (ticker, category, market, exchange)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (ticker) DO UPDATE SET
				category = EXCLUDED.category,
				market = EXCLUDED.market,
				exchange = EXCLUDED.exchange
		`, meta.Ticker, meta.Category, meta.Market, "")
	}
	br := pool.SendBatch(ctx, batch)
	defer br.Close()
	for range DefaultETFUniverse {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("插入 ticker 失败: %w", err)
		}
	}
	slog.Info("已种子化默认 ETF 宇宙", "count", len(DefaultETFUniverse))
	return nil
}

type dailyPrice = provider.DailyPrice

func fetchAndStore(ctx context.Context, pool *pgxpool.Pool, ticker, startDate, endDate string) error {
	if pool == nil {
		return fmt.Errorf("数据库未连接，无法写入数据")
	}
	if IsSIMTicker(ticker) {
		def := GetSIMDefinition(ticker)
		if def == nil {
			return fmt.Errorf("未知的 SIM Ticker: %s", ticker)
		}
		return spliceSIMData(ctx, pool, def, startDate, endDate)
	}
	providers := reg.ForTicker(ticker)
	if len(providers) == 0 {
		return fmt.Errorf("没有可用的数据源: %s", ticker)
	}
	prices, providerName, err := provider.FetchWithFallback(providers, ticker, startDate, endDate)
	if err != nil {
		return fmt.Errorf("获取 %s 数据失败: %w", ticker, err)
	}
	if len(prices) == 0 {
		slog.Warn("无数据", "ticker", ticker, "provider", providerName)
		return nil
	}
	slog.Info("获取成功", "ticker", ticker, "provider", providerName, "count", len(prices))
	return writePricesToDB(ctx, pool, ticker, prices)
}
func sanitizePrices(prices []dailyPrice) []dailyPrice {
	valid := make([]dailyPrice, 0, len(prices))
	for _, p := range prices {
		if p.High < p.Low {
			p.High, p.Low = p.Low, p.High
		}
		if p.Open < p.Low {
			p.Open = p.Low
		}
		if p.Close < p.Low {
			p.Close = p.Low
		}
		if p.High < p.Open {
			p.High = p.Open
		}
		if p.High < p.Close {
			p.High = p.Close
		}
		if p.Volume < 0 {
			p.Volume = 0
		}
		valid = append(valid, p)
	}
	return valid
}
func writePricesToDB(ctx context.Context, pool *pgxpool.Pool, ticker string, prices []dailyPrice) error {
	prices = sanitizePrices(prices)
	batch := &pgx.Batch{}
	for _, p := range prices {
		batch.Queue(`
			INSERT INTO prices (ticker, date, open, high, low, close, volume, adjusted_close)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (ticker, date) DO UPDATE SET
				open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
				close = EXCLUDED.close, volume = EXCLUDED.volume, adjusted_close = EXCLUDED.adjusted_close
		`, ticker, p.Date, p.Open, p.High, p.Low, p.Close, p.Volume, p.AdjustedClose)
	}
	br := pool.SendBatch(ctx, batch)
	defer br.Close()
	for range prices {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("写入数据库失败: %w", err)
		}
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO tickers (ticker, exchange) VALUES ($1, $2)
		ON CONFLICT (ticker) DO UPDATE SET exchange = EXCLUDED.exchange
		WHERE tickers.exchange = ''
	`, ticker, provider.DeriveExchange(ticker)); err != nil {
		return fmt.Errorf("更新 tickers.exchange 失败: %w", err)
	}
	lastDate := prices[len(prices)-1].Date
	_, err := pool.Exec(ctx, `
		INSERT INTO worker_progress (ticker, last_date, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (ticker) DO UPDATE SET last_date = EXCLUDED.last_date, updated_at = EXCLUDED.updated_at
	`, ticker, lastDate)
	return err
}
