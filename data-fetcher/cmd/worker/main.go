package main

import (
	"data-fetcher/internal/provider"
	"data-fetcher/internal/registry"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

type WorkerConfig struct {
	DatabaseURL string
}

func defaultWorkerConfig() *WorkerConfig {
	return &WorkerConfig{DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL"))}
}
func parseFlags(fs *flag.FlagSet, args []string) {
	if err := fs.Parse(args); err != nil {
		slog.Error("参数解析失败", "error", err)
		os.Exit(1)
	}
}
func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	cfg := defaultWorkerConfig()
	fetchCmd := flag.NewFlagSet("fetch", flag.ExitOnError)
	fetchTicker := fetchCmd.String("ticker", "", "标的代码 (e.g. SPY, 000001_SZ)")
	fetchStart := fetchCmd.String("start", "2000-01-01", "起始日期 (YYYY-MM-DD)")
	fetchEnd := fetchCmd.String("end", time.Now().Format("2006-01-02"), "结束日期 (YYYY-MM-DD)")
	updateCmd := flag.NewFlagSet("update", flag.ExitOnError)
	updateIncremental := updateCmd.Bool("incremental", false, "增量更新（仅获取新日期数据）")
	updateStart := updateCmd.String("start", "2000-01-01", "起始日期 (YYYY-MM-DD)")
	updateEnd := updateCmd.String("end", time.Now().Format("2006-01-02"), "结束日期 (YYYY-MM-DD)")
	seedCmd := flag.NewFlagSet("seed", flag.ExitOnError)
	fetchUniverseCmd := flag.NewFlagSet("fetch-universe", flag.ExitOnError)
	fetchUniverseFile := fetchUniverseCmd.String("file", "", "本地 ticker 列表文件路径（留空则从 NASDAQ/NYSE/AMEX 在线下载）")
	fetchSIMCmd := flag.NewFlagSet("fetch-sim", flag.ExitOnError)
	fetchSIMStart := fetchSIMCmd.String("start", "2000-01-01", "起始日期 (YYYY-MM-DD)")
	fetchSIMEnd := fetchSIMCmd.String("end", time.Now().Format("2006-01-02"), "结束日期 (YYYY-MM-DD)")
	if len(os.Args) < 2 {
		fmt.Println("用法: worker <command> [options]")
		fmt.Println()
		fmt.Println("命令:")
		fmt.Println("  fetch           获取单个标的数据")
		fmt.Println("  update          更新所有标的数据（从 tickers 表）")
		fmt.Println("  seed            种子化默认 50 个 ETF 到数据库")
		fmt.Println("  fetch-universe  从在线列表或本地文件导入全量 ticker")
		fmt.Println("  fetch-sim       获取 SIM 系列模拟 Ticker 数据（Total Return 近似）")
		fmt.Println()
		fmt.Println("示例:")
		fmt.Println("  worker seed                                                  # 种子化默认 ETF")
		fmt.Println("  worker fetch-universe                                        # 从 NASDAQ/NYSE/AMEX 下载全量 ticker")
		fmt.Println("  worker fetch-universe --file=my_tickers.txt                  # 从本地文件导入 ticker")
		fmt.Println("  worker update                                                # 全量下载所有 ticker 价格（2000-至今）")
		fmt.Println("  worker update --start=2010-01-01 --end=2024-12-31             # 指定日期范围")
		fmt.Println("  worker update --incremental                                  # 增量更新")
		fmt.Println("  worker fetch --ticker=SPY --start=2000-01-01                  # 单个标的")
		fmt.Println("  worker fetch-sim                                             # 获取所有 SIM Ticker 数据")
		fmt.Println("  worker fetch-sim --start=2010-01-01                          # 指定起始日期")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "fetch":
		parseFlags(fetchCmd, os.Args[2:])
		if *fetchTicker == "" {
			fmt.Println("错误: 必须指定 --ticker")
			os.Exit(1)
		}
		if err := cmdFetch(cfg, *fetchTicker, *fetchStart, *fetchEnd); err != nil {
			slog.Error("fetch 失败", "error", err)
			os.Exit(1)
		}
	case "update":
		parseFlags(updateCmd, os.Args[2:])
		if err := cmdUpdate(cfg, *updateIncremental, *updateStart, *updateEnd); err != nil {
			slog.Error("update 失败", "error", err)
			os.Exit(1)
		}
	case "seed":
		parseFlags(seedCmd, os.Args[2:])
		if err := cmdSeed(cfg); err != nil {
			slog.Error("seed 失败", "error", err)
			os.Exit(1)
		}
	case "fetch-universe":
		parseFlags(fetchUniverseCmd, os.Args[2:])
		if err := cmdFetchUniverse(cfg, *fetchUniverseFile); err != nil {
			slog.Error("fetch-universe 失败", "error", err)
			os.Exit(1)
		}
	case "fetch-sim":
		parseFlags(fetchSIMCmd, os.Args[2:])
		if err := cmdFetchSIM(cfg, *fetchSIMStart, *fetchSIMEnd); err != nil {
			slog.Error("fetch-sim 失败", "error", err)
			os.Exit(1)
		}
	default:
		fmt.Printf("未知命令: %s\n", os.Args[1])
		os.Exit(1)
	}
}

var reg *provider.Registry

func init() {
	reg = registry.New()
}
