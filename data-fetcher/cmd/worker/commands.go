package main

// CLI 子命令实现（fetch / update / seed）。
// 从 cmd/worker/main.go 抽取（Task 2.7 单一职责拆分）。

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// cmdFetch 抓取单个标的的指定日期范围数据并写入数据库。
func cmdFetch(cfg *WorkerConfig, ticker, startDate, endDate string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()
	return fetchAndStore(ctx, pool, ticker, startDate, endDate)
}

// cmdSeed 将默认 ETF 宇宙种子化到数据库。
func cmdSeed(cfg *WorkerConfig) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()

	return seedUniverse(ctx, pool)
}

// cmdFetchSIM 获取所有 SIM 系列模拟 Ticker 数据。
// SIM Ticker 使用多段数据拼接系统获取完整的 total return 序列。
func cmdFetchSIM(cfg *WorkerConfig, startDate, endDate string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()

	simTickers := GetAllSIMTickers()
	slog.Info("开始获取 SIM Ticker 数据", "count", len(simTickers), "start", startDate, "end", endDate)

	// 先插入所有 SIM Ticker 到 tickers 表（满足外键约束）
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

// cmdUpdate 更新所有标的；incremental=true 时启用断点续传（跳过今日已更新标的）。
// 若 tickers 表为空，自动种子化默认 ETF 宇宙。
// startDate/endDate 仅在非增量模式下生效，增量模式下使用 worker_progress 中的 last_date。
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
