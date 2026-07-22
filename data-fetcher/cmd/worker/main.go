package main

// 离线数据引擎 worker
// 企业理由：替代 Python 脚本的全量/增量数据更新功能。
// 支持全量导入、增量更新、断点续传。
//
// 文件拆分（Task 2.7 单一职责）：
// - main.go：WorkerConfig + main + flag 解析
// - db.go：initDB + ensureSchema + loadTickerList
// - providers.go：provider 注册表 init()
// - fetch.go：fetchAndStore + writePricesToDB
// - commands.go：cmdFetch + cmdUpdate

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// ============================================================
// 配置
// ============================================================

// WorkerConfig 是 worker 子命令共享的配置。
type WorkerConfig struct {
	DatabaseURL string
}

func defaultWorkerConfig() *WorkerConfig {
	return &WorkerConfig{
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
	}
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
	if dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); dbURL != "" {
		cfg.DatabaseURL = dbURL
	}

	// 子命令
	fetchCmd := flag.NewFlagSet("fetch", flag.ExitOnError)
	fetchTicker := fetchCmd.String("ticker", "", "标的代码 (e.g. SPY, 000001_SZ)")
	fetchStart := fetchCmd.String("start", "2020-01-01", "起始日期 (YYYY-MM-DD)")
	fetchEnd := fetchCmd.String("end", time.Now().Format("2006-01-02"), "结束日期 (YYYY-MM-DD)")

	updateCmd := flag.NewFlagSet("update", flag.ExitOnError)
	updateIncremental := updateCmd.Bool("incremental", false, "增量更新（仅获取新日期数据）")

	if len(os.Args) < 2 {
		fmt.Println("用法: worker <command> [options]")
		fmt.Println("命令:")
		fmt.Println("  fetch        获取单个标的数据")
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
