package main

// 数据获取与写入数据库。
// 从 cmd/worker/main.go 抽取（Task 2.7 单一职责拆分）。

import (
	"context"
	"fmt"
	"log/slog"

	"data-fetcher/internal/provider"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// dailyPrice 是 provider.DailyPrice 的本地别名，避免在 writePricesToDB 签名中暴露内部依赖。
type dailyPrice = provider.DailyPrice

// fetchAndStore 通过 provider 注册表抓取单只标的行情并写入数据库。
// 对于 SIM Ticker（如 SPYSIM），使用多段数据拼接系统获取完整的 total return 序列。
func fetchAndStore(ctx context.Context, pool *pgxpool.Pool, ticker, startDate, endDate string) error {
	if pool == nil {
		return fmt.Errorf("数据库未连接，无法写入数据")
	}

	// SIM Ticker：使用多段拼接系统
	if IsSIMTicker(ticker) {
		def := GetSIMDefinition(ticker)
		if def == nil {
			return fmt.Errorf("未知的 SIM Ticker: %s", ticker)
		}
		return spliceSIMData(ctx, pool, def, startDate, endDate)
	}

	// 普通 Ticker：直接从 provider 获取
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

// sanitizePrices 清洗并修复异常行情数据，确保满足数据库约束 prices_ohlc_check：
//   - high >= low
//   - low <= open AND low <= close
//   - high >= open AND high >= close
//   - volume >= 0
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

// writePricesToDB 批量写入行情数据并更新 worker_progress 断点续传表。
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

	// 回填 tickers.exchange（Task 4.5）：按 ticker 后缀推导交易所代码。
	// 仅在 exchange 为空时更新，保留已手动设置（如 NASDAQ/NYSE 细化）的值。
	// exchange 由 ticker 确定性推导，幂等可重复。
	if _, err := pool.Exec(ctx, `
		INSERT INTO tickers (ticker, exchange) VALUES ($1, $2)
		ON CONFLICT (ticker) DO UPDATE SET exchange = EXCLUDED.exchange
		WHERE tickers.exchange = ''
	`, ticker, provider.DeriveExchange(ticker)); err != nil {
		return fmt.Errorf("更新 tickers.exchange 失败: %w", err)
	}

	// 更新 worker_progress
	lastDate := prices[len(prices)-1].Date
	_, err := pool.Exec(ctx, `
		INSERT INTO worker_progress (ticker, last_date, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (ticker) DO UPDATE SET last_date = EXCLUDED.last_date, updated_at = EXCLUDED.updated_at
	`, ticker, lastDate)

	return err
}
