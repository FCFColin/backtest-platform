package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

func cmdFetch(cfg *WorkerConfig, ticker, startDate, endDate string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()
	return fetchAndStore(ctx, pool, ticker, startDate, endDate)
}
func cmdSeed(cfg *WorkerConfig) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()
	return seedUniverse(ctx, pool)
}
func cmdFetchSIM(cfg *WorkerConfig, startDate, endDate string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()
	simTickers := GetAllSIMTickers()
	slog.Info("开始获取 SIM Ticker 数据", "count", len(simTickers), "start", startDate, "end", endDate)
	for _, ticker := range simTickers {
		def := GetSIMDefinition(ticker)
		if def == nil {
			continue
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO tickers (ticker, category, market, exchange)
			VALUES ($1, $2, 'US', 'SIM')
			ON CONFLICT (ticker) DO NOTHING
		`, ticker, def.Category); err != nil {
			slog.Warn("插入 tickers 记录失败", "ticker", ticker, "error", err)
		}
	}
	successCount := 0
	for i, ticker := range simTickers {
		def := GetSIMDefinition(ticker)
		if def == nil {
			continue
		}
		slog.Info("获取 SIM 数据", "ticker", ticker, "name", def.Name, "segments", len(def.Segments), "progress", fmt.Sprintf("%d/%d", i+1, len(simTickers)))
		if err := fetchAndStore(ctx, pool, ticker, startDate, endDate); err != nil {
			slog.Warn("获取失败", "ticker", ticker, "error", err)
			continue
		}
		successCount++
	}
	slog.Info("SIM Ticker 数据获取完成", "total", len(simTickers), "success", successCount)
	return nil
}
func cmdUpdate(cfg *WorkerConfig, incremental bool, startDate, endDate string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()
	empty, err := isTickerTableEmpty(ctx, pool)
	if err != nil {
		return fmt.Errorf("检查 tickers 表失败: %w", err)
	}
	if empty {
		slog.Info("tickers 表为空，自动种子化默认 ETF 宇宙")
		if err := seedUniverse(ctx, pool); err != nil {
			return fmt.Errorf("种子化 ETF 宇宙失败: %w", err)
		}
	}
	tickers, err := loadTickerList(ctx, pool)
	if err != nil {
		return fmt.Errorf("加载标的列表失败: %w", err)
	}
	slog.Info("开始更新", "ticker_count", len(tickers), "incremental", incremental, "start", startDate, "end", endDate)
	successCount := 0
	for i, ticker := range tickers {
		if incremental {
			var updatedAt *time.Time
			err := pool.QueryRow(ctx, "SELECT updated_at FROM worker_progress WHERE ticker = $1", ticker).Scan(&updatedAt)
			if err == nil && updatedAt != nil && updatedAt.Format("2006-01-02") == endDate {
				slog.Info("跳过（今日已更新）", "ticker", ticker, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))
				continue
			}
		}
		actualStart := startDate
		if incremental {
			var lastDate *string
			err := pool.QueryRow(ctx, "SELECT last_date FROM worker_progress WHERE ticker = $1", ticker).Scan(&lastDate)
			if err == nil && lastDate != nil {
				actualStart = *lastDate
			}
		}
		slog.Info("获取数据", "ticker", ticker, "start", actualStart, "end", endDate, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))
		if err := fetchAndStore(ctx, pool, ticker, actualStart, endDate); err != nil {
			slog.Warn("获取失败", "ticker", ticker, "error", err)
			continue
		}
		successCount++
	}
	slog.Info("更新完成", "total", len(tickers), "success", successCount)
	return nil
}
