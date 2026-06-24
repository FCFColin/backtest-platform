package main

// 离线数据引擎 worker
// 企业理由：替代 Python 脚本的全量/增量数据更新功能。
// 支持全量导入、增量更新、断点续传。

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"data-fetcher/internal/akshare"
	"data-fetcher/internal/yfinance"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ============================================================
// 配置
// ============================================================

type WorkerConfig struct {
	DatabaseURL string
	DataDir     string
	ResumeFile  string
}

func defaultWorkerConfig() *WorkerConfig {
	root := findProjectRoot()
	return &WorkerConfig{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		DataDir:     filepath.Join(root, "data", "market"),
		ResumeFile:  filepath.Join(root, "data", "market", "state", ".worker_resume"),
	}
}

func findProjectRoot() string {
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

// ============================================================
// 数据库操作
// ============================================================

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
		adj_close DOUBLE PRECISION,
		PRIMARY KEY (ticker, date)
	);
	CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices (ticker, date);

	CREATE TABLE IF NOT EXISTS tickers (
		ticker TEXT PRIMARY KEY,
		name   TEXT,
		market TEXT,
		category TEXT
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

// ============================================================
// 断点续传
// ============================================================

func loadResumeState(resumeFile string) map[string]string {
	state := make(map[string]string)
	data, err := os.ReadFile(resumeFile)
	if err != nil {
		return state
	}
	json.Unmarshal(data, &state)
	return state
}

func saveResumeState(resumeFile string, state map[string]string) error {
	dir := filepath.Dir(resumeFile)
	os.MkdirAll(dir, 0755)

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(resumeFile, data, 0644)
}

// ============================================================
// 标的列表
// ============================================================

func loadTickerList(ctx context.Context, pool *pgxpool.Pool, cfg *WorkerConfig) ([]string, error) {
	// 优先从数据库读取
	if pool != nil {
		rows, err := pool.Query(ctx, "SELECT ticker FROM tickers ORDER BY ticker")
		if err == nil {
			defer rows.Close()
			var tickers []string
			for rows.Next() {
				var t string
				if rows.Scan(&t) == nil {
					tickers = append(tickers, t)
				}
			}
			if len(tickers) > 0 {
				return tickers, nil
			}
		}
	}

	// 回退到配置文件
	configFile := filepath.Join(cfg.DataDir, "state", "universe.json")
	data, err := os.ReadFile(configFile)
	if err != nil {
		return nil, fmt.Errorf("无法加载标的列表: %w", err)
	}

	var tickers []struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(data, &tickers); err != nil {
		return nil, fmt.Errorf("解析标的列表失败: %w", err)
	}

	var result []string
	for _, t := range tickers {
		result = append(result, t.Code)
	}
	return result, nil
}

// ============================================================
// 数据获取与写入
// ============================================================

func fetchAndStore(ctx context.Context, pool *pgxpool.Pool, dataDir, ticker, startDate, endDate string) error {
	var isAStock bool
	if strings.HasSuffix(ticker, ".SZ") || strings.HasSuffix(ticker, ".SH") {
		isAStock = true
	}

	var prices []dailyPrice
	var err error

	if isAStock {
		// A股：转换代码格式 000001.SZ -> 000001
		code := strings.Split(ticker, ".")[0]
		prices, err = fetchAStock(code, startDate, endDate)
	} else {
		prices, err = fetchUSStock(ticker, startDate, endDate)
	}

	if err != nil {
		return fmt.Errorf("获取 %s 数据失败: %w", ticker, err)
	}

	if len(prices) == 0 {
		slog.Warn("无数据", "ticker", ticker)
		return nil
	}

	// 写入数据库
	if pool != nil {
		return writePricesToDB(ctx, pool, ticker, prices)
	}

	// 回退：写入 JSON 文件
	return writePricesToFile(dataDir, ticker, prices)
}

type dailyPrice struct {
	Date          string
	Open          float64
	High          float64
	Low           float64
	Close         float64
	Volume        int64
	AdjustedClose float64
}

func fetchAStock(code, startDate, endDate string) ([]dailyPrice, error) {
	raw, err := akshare.FetchStockDaily(code, startDate, endDate)
	if err != nil {
		return nil, err
	}
	var prices []dailyPrice
	for _, p := range raw {
		prices = append(prices, dailyPrice{
			Date: p.Date, Open: p.Open, High: p.High, Low: p.Low,
			Close: p.Close, Volume: p.Volume, AdjustedClose: p.AdjustedClose,
		})
	}
	return prices, nil
}

func fetchUSStock(ticker, startDate, endDate string) ([]dailyPrice, error) {
	raw, err := yfinance.FetchStockDaily(ticker, startDate, endDate)
	if err != nil {
		return nil, err
	}
	var prices []dailyPrice
	for _, p := range raw {
		prices = append(prices, dailyPrice{
			Date: p.Date, Open: p.Open, High: p.High, Low: p.Low,
			Close: p.Close, Volume: p.Volume, AdjustedClose: p.AdjustedClose,
		})
	}
	return prices, nil
}

func writePricesToDB(ctx context.Context, pool *pgxpool.Pool, ticker string, prices []dailyPrice) error {
	batch := &pgx.Batch{}
	for _, p := range prices {
		batch.Queue(`
			INSERT INTO prices (ticker, date, open, high, low, close, volume, adj_close)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (ticker, date) DO UPDATE SET
				open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
				close = EXCLUDED.close, volume = EXCLUDED.volume, adj_close = EXCLUDED.adj_close
		`, ticker, p.Date, p.Open, p.High, p.Low, p.Close, p.Volume, p.AdjustedClose)
	}

	br := pool.SendBatch(ctx, batch)
	defer br.Close()

	for range prices {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("写入数据库失败: %w", err)
		}
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

func writePricesToFile(dataDir, ticker string, prices []dailyPrice) error {
	tickersDir := filepath.Join(dataDir, "tickers")
	os.MkdirAll(tickersDir, 0755)

	fileName := strings.ReplaceAll(ticker, ".", "_") + ".json"
	filePath := filepath.Join(tickersDir, fileName)

	type priceEntry struct {
		Date     string  `json:"date"`
		Open     float64 `json:"open"`
		High     float64 `json:"high"`
		Low      float64 `json:"low"`
		Close    float64 `json:"close"`
		Volume   int64   `json:"volume"`
		AdjClose float64 `json:"adj_close"`
	}

	var entries []priceEntry
	for _, p := range prices {
		entries = append(entries, priceEntry{
			Date: p.Date, Open: p.Open, High: p.High, Low: p.Low,
			Close: p.Close, Volume: p.Volume, AdjClose: p.AdjustedClose,
		})
	}

	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// ============================================================
// CLI 命令
// ============================================================

func cmdFetch(cfg *WorkerConfig, ticker, startDate, endDate string) error {
	ctx := context.Background()

	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		var err error
		pool, err = initDB(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Warn("数据库连接失败，将写入文件", "error", err)
		} else {
			defer pool.Close()
		}
	}

	return fetchAndStore(ctx, pool, cfg.DataDir, ticker, startDate, endDate)
}

func cmdImportAll(cfg *WorkerConfig, dir string) error {
	ctx := context.Background()

	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		var err error
		pool, err = initDB(ctx, cfg.DatabaseURL)
		if err != nil {
			return fmt.Errorf("数据库连接失败: %w", err)
		}
		defer pool.Close()
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("读取目录失败: %w", err)
	}

	successCount := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		ticker := strings.TrimSuffix(entry.Name(), ".json")
		filePath := filepath.Join(dir, entry.Name())

		data, err := os.ReadFile(filePath)
		if err != nil {
			slog.Warn("读取文件失败", "file", filePath, "error", err)
			continue
		}

		var prices []dailyPrice
		if err := json.Unmarshal(data, &prices); err != nil {
			slog.Warn("解析文件失败", "file", filePath, "error", err)
			continue
		}

		if pool != nil {
			if err := writePricesToDB(ctx, pool, ticker, prices); err != nil {
				slog.Warn("写入数据库失败", "ticker", ticker, "error", err)
				continue
			}
		}

		successCount++
		slog.Info("导入成功", "ticker", ticker, "count", len(prices))
	}

	slog.Info("导入完成", "total", len(entries), "success", successCount)
	return nil
}

func cmdUpdate(cfg *WorkerConfig, incremental bool) error {
	ctx := context.Background()

	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		var err error
		pool, err = initDB(ctx, cfg.DatabaseURL)
		if err != nil {
			return fmt.Errorf("数据库连接失败: %w", err)
		}
		defer pool.Close()
	}

	tickers, err := loadTickerList(ctx, pool, cfg)
	if err != nil {
		return fmt.Errorf("加载标的列表失败: %w", err)
	}

	slog.Info("开始更新", "ticker_count", len(tickers), "incremental", incremental)

	// 加载断点续传状态
	resumeState := loadResumeState(cfg.ResumeFile)
	today := time.Now().Format("2006-01-02")

	successCount := 0
	for i, ticker := range tickers {
		// 断点续传：跳过已完成的 ticker
		if incremental && resumeState[ticker] == today {
			slog.Info("跳过（已完成）", "ticker", ticker, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))
			continue
		}

		// 增量更新：从上次更新日期开始
		startDate := "2020-01-01"
		if incremental && pool != nil {
			var lastDate *string
			err := pool.QueryRow(ctx, "SELECT last_date FROM worker_progress WHERE ticker = $1", ticker).Scan(&lastDate)
			if err == nil && lastDate != nil {
				startDate = *lastDate
			}
		}

		slog.Info("获取数据", "ticker", ticker, "start", startDate, "end", today, "progress", fmt.Sprintf("%d/%d", i+1, len(tickers)))

		if err := fetchAndStore(ctx, pool, cfg.DataDir, ticker, startDate, today); err != nil {
			slog.Warn("获取失败", "ticker", ticker, "error", err)
			continue
		}

		// 更新断点续传状态
		resumeState[ticker] = today
		if i%10 == 0 {
			saveResumeState(cfg.ResumeFile, resumeState)
		}

		successCount++
	}

	// 保存最终状态
	saveResumeState(cfg.ResumeFile, resumeState)

	slog.Info("更新完成", "total", len(tickers), "success", successCount)
	return nil
}

// ============================================================
// 主函数
// ============================================================

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := defaultWorkerConfig()
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		cfg.DatabaseURL = dbURL
	}
	if dir := os.Getenv("DATA_DIR"); dir != "" {
		cfg.DataDir = dir
	}

	// 子命令
	fetchCmd := flag.NewFlagSet("fetch", flag.ExitOnError)
	fetchTicker := fetchCmd.String("ticker", "", "标的代码 (e.g. VTI, 000001.SZ)")
	fetchStart := fetchCmd.String("start", "2020-01-01", "起始日期 (YYYY-MM-DD)")
	fetchEnd := fetchCmd.String("end", time.Now().Format("2006-01-02"), "结束日期 (YYYY-MM-DD)")

	importCmd := flag.NewFlagSet("import-all", flag.ExitOnError)
	importDir := importCmd.String("dir", "", "数据目录路径")

	updateCmd := flag.NewFlagSet("update", flag.ExitOnError)
	updateIncremental := updateCmd.Bool("incremental", false, "增量更新（仅获取新日期数据）")

	if len(os.Args) < 2 {
		fmt.Println("用法: worker <command> [options]")
		fmt.Println("命令:")
		fmt.Println("  fetch        获取单个标的数据")
		fmt.Println("  import-all   从目录批量导入数据")
		fmt.Println("  update       更新所有标的数据")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "fetch":
		fetchCmd.Parse(os.Args[2:])
		if *fetchTicker == "" {
			fmt.Println("错误: 必须指定 --ticker")
			os.Exit(1)
		}
		if err := cmdFetch(cfg, *fetchTicker, *fetchStart, *fetchEnd); err != nil {
			slog.Error("fetch 失败", "error", err)
			os.Exit(1)
		}

	case "import-all":
		importCmd.Parse(os.Args[2:])
		dir := *importDir
		if dir == "" {
			dir = filepath.Join(cfg.DataDir, "tickers")
		}
		if err := cmdImportAll(cfg, dir); err != nil {
			slog.Error("import-all 失败", "error", err)
			os.Exit(1)
		}

	case "update":
		updateCmd.Parse(os.Args[2:])
		if err := cmdUpdate(cfg, *updateIncremental); err != nil {
			slog.Error("update 失败", "error", err)
			os.Exit(1)
		}

	default:
		fmt.Printf("未知命令: %s\n", os.Args[1])
		os.Exit(1)
	}
}
