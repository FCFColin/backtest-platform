package main

// 数据库连接与 schema 初始化、标的列表加载。
// 从 cmd/worker/main.go 抽取（Task 2.7 单一职责拆分）。

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// initDB 建立数据库连接池并确保 schema 存在。
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

	// 确保 schema 存在
	if err := ensureSchema(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("初始化 schema 失败: %w", err)
	}

	return pool, nil
}

// ensureSchema 创建必要的表结构（幂等）。
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
		name   TEXT,
		market TEXT,
		category TEXT,
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

// loadTickerList 从 tickers 表加载所有标的代码（按字母序）。
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
	if len(tickers) == 0 {
		return nil, fmt.Errorf("数据库中无标的记录")
	}
	return tickers, nil
}
