package main

// CLI 子命令实现（fetch / update）。
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

// cmdUpdate 更新所有标的；incremental=true 时启用断点续传（跳过今日已更新标的）。
func cmdUpdate(cfg *WorkerConfig, incremental bool) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()

	tickers, err := loadTickerList(ctx, pool)
	if err != nil {
		return fmt.Errorf("加载标的列表失败: %w", err)
	}

	slog.Info("开始更新", "ticker_count", len(tickers), "incremental", incremental)
	today := time.Now().Format("2006-01-02")

	successCount := 0
	for i, ticker := range tickers {
		// 断点续传：通过 worker_progress 表检查今日是否已更新
		if incremental {
			var updatedAt *time.Time
			err := pool.QueryRow(ctx, "SELECT updated_at FROM worker_progress WHERE ticker = $1", ticker).Scan(&updatedAt)
			if err == nil && updatedAt != nil && updatedAt.Format("2006-01-02") == today {
				slog.Info("跳过（今日已更新）", "ticker", ticker, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))
				continue
			}
		}

		startDate := "2020-01-01"
		if incremental {
			var lastDate *string
			err := pool.QueryRow(ctx, "SELECT last_date FROM worker_progress WHERE ticker = $1", ticker).Scan(&lastDate)
			if err == nil && lastDate != nil {
				startDate = *lastDate
			}
		}

		slog.Info("获取数据", "ticker", ticker, "start", startDate, "end", today, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))

		if err := fetchAndStore(ctx, pool, ticker, startDate, today); err != nil {
			slog.Warn("获取失败", "ticker", ticker, "error", err)
			continue
		}

		successCount++
	}

	slog.Info("更新完成", "total", len(tickers), "success", successCount)
	return nil
}
