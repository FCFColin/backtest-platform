package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	nasdaqListURL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
	otherListURL  = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
)

// TickerEntry 解析自列表文件的单行记录。
type TickerEntry struct {
	Ticker   string
	Name     string
	Category string
	Market   string
}

// downloadURL 下载指定 URL 的内容。
func downloadURL(url string) ([]byte, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("下载 %s 失败: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("下载 %s 返回状态码 %d", url, resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// parsePipeDelimited 解析管道分隔的列表文件，返回每行的字段数组。
func parsePipeDelimited(data []byte, skipHeaders bool) [][]string {
	var rows [][]string
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if skipHeaders && strings.HasPrefix(line, "Symbol|") {
			continue
		}
		if strings.HasPrefix(line, "File Creation") {
			continue
		}
		fields := strings.Split(line, "|")
		for i := range fields {
			fields[i] = strings.TrimSpace(fields[i])
		}
		rows = append(rows, fields)
	}
	return rows
}

// parseNASDAQList 解析 NASDAQ 列表文件（管道分隔）。
// 格式：Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
func parseNASDAQList(data []byte) []TickerEntry {
	var entries []TickerEntry
	for _, fields := range parsePipeDelimited(data, true) {
		if len(fields) < 2 {
			continue
		}
		symbol := fields[0]
		if symbol == "" {
			continue
		}
		name := ""
		if len(fields) > 1 {
			name = fields[1]
		}
		isTest := len(fields) > 3 && strings.ToUpper(fields[3]) == "Y"
		isETF := len(fields) > 6 && strings.ToUpper(fields[6]) == "Y"
		if isTest {
			continue
		}
		category := "US Equity"
		if isETF {
			category = "ETF"
		}
		entries = append(entries, TickerEntry{
			Ticker: symbol, Name: name, Category: category, Market: "US",
		})
	}
	return entries
}

// parseOtherList 解析 NYSE/AMEX/ARCA/IEX 列表文件。
// 格式：ACT Symbol|...|Security Name|...|Exchange|...|ETF|...
func parseOtherList(data []byte) []TickerEntry {
	var entries []TickerEntry
	for _, fields := range parsePipeDelimited(data, true) {
		if len(fields) < 2 {
			continue
		}
		symbol := fields[0]
		if symbol == "" {
			continue
		}
		name := ""
		if len(fields) > 2 {
			name = fields[2]
		}
		isETF := len(fields) > 5 && strings.ToUpper(fields[5]) == "Y"
		category := "US Equity"
		if isETF {
			category = "ETF"
		}
		entries = append(entries, TickerEntry{
			Ticker: symbol, Name: name, Category: category, Market: "US",
		})
	}
	return entries
}

// loadTickersFromFile 从本地文件加载 ticker 列表。
// 支持三种格式：
//   - 纯 ticker 列表（每行一个 ticker）
//   - TSV/CSV：ticker,name,category（逗号或制表符分隔）
//   - 管道分隔：ticker|name|category
func loadTickersFromFile(path string) ([]TickerEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开文件 %s 失败: %w", path, err)
	}
	defer f.Close()

	var entries []TickerEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// 自动检测分隔符
		var fields []string
		switch {
		case strings.Contains(line, "|"):
			fields = strings.Split(line, "|")
		case strings.Contains(line, ","):
			fields = strings.Split(line, ",")
		case strings.Contains(line, "\t"):
			fields = strings.Split(line, "\t")
		default:
			fields = []string{line}
		}
		for i := range fields {
			fields[i] = strings.TrimSpace(fields[i])
		}
		ticker := fields[0]
		if ticker == "" {
			continue
		}
		name := ""
		if len(fields) > 1 {
			name = fields[1]
		}
		category := ""
		if len(fields) > 2 {
			category = fields[2]
		}
		if category == "" {
			category = "Custom"
		}
		entries = append(entries, TickerEntry{
			Ticker: ticker, Name: name, Category: category, Market: "Custom",
		})
	}
	slog.Info("从文件加载 ticker", "path", path, "count", len(entries))
	return entries, nil
}

// mergeAndDedup 合并多个 ticker 列表并去重。
// 保留第一个出现的条目（优先级顺序），空字段用非空填充。
func mergeAndDedup(lists ...[]TickerEntry) []TickerEntry {
	seen := make(map[string]TickerEntry)
	for _, list := range lists {
		for _, e := range list {
			key := strings.ToUpper(e.Ticker)
			if existing, ok := seen[key]; ok {
				if e.Name != "" && existing.Name == "" {
					existing.Name = e.Name
					seen[key] = existing
				}
			} else {
				seen[key] = e
			}
		}
	}
	result := make([]TickerEntry, 0, len(seen))
	for _, e := range seen {
		result = append(result, e)
	}
	return result
}

// writeTickersToDB 批量写入 ticker 到数据库（幂等）。
func writeTickersToDB(ctx context.Context, pool *pgxpool.Pool, entries []TickerEntry) (int, error) {
	inserted := 0
	for _, e := range entries {
		category := e.Category
		if category == "" {
			category = "Custom"
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO tickers (ticker, category, market, exchange)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (ticker) DO UPDATE SET
				category = CASE WHEN tickers.category = '' OR tickers.category = 'Custom' THEN EXCLUDED.category ELSE tickers.category END,
				market = CASE WHEN tickers.market = '' THEN EXCLUDED.market ELSE tickers.market END
		`, e.Ticker, category, e.Market, deriveExchange(e.Ticker))
		if err != nil {
			slog.Warn("插入 ticker 失败", "ticker", e.Ticker, "error", err)
			continue
		}
		inserted++
	}
	return inserted, nil
}

// deriveExchange 按 ticker 后缀推导交易所。
func deriveExchange(ticker string) string {
	upper := strings.ToUpper(ticker)
	if strings.HasSuffix(upper, ".SZ") || strings.HasSuffix(upper, "_SZ") {
		return "SZSE"
	}
	if strings.HasSuffix(upper, ".SS") || strings.HasSuffix(upper, "_SS") ||
		strings.HasSuffix(upper, ".SH") || strings.HasSuffix(upper, "_SH") {
		return "SSE"
	}
	return "US"
}

// cmdFetchUniverse 下载全量 ticker 列表并写入数据库。
// 用法：worker fetch-universe [--file=xxx.txt]
//   - 不带 --file：从 NASDAQ + NYSE/AMEX 在线列表下载
//   - 带 --file：从本地文件加载（支持纯 ticker 列表、CSV、TSV）
func cmdFetchUniverse(cfg *WorkerConfig, filePath string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("数据库连接失败: %w", err)
	}
	defer pool.Close()

	var allEntries []TickerEntry

	if filePath != "" {
		entries, err := loadTickersFromFile(filePath)
		if err != nil {
			return err
		}
		allEntries = entries
	} else {
		slog.Info("从 NASDAQ/NYSE/AMEX 下载 ticker 列表...")
		nasdaqData, err := downloadURL(nasdaqListURL)
		if err != nil {
			return fmt.Errorf("获取 NASDAQ 列表失败: %w", err)
		}
		nasdaqEntries := parseNASDAQList(nasdaqData)
		slog.Info("NASDAQ 列表", "count", len(nasdaqEntries))

		otherData, err := downloadURL(otherListURL)
		if err != nil {
			return fmt.Errorf("获取 Other 列表失败: %w", err)
		}
		otherEntries := parseOtherList(otherData)
		slog.Info("NYSE/AMEX 列表", "count", len(otherEntries))

		allEntries = mergeAndDedup(nasdaqEntries, otherEntries)
	}

	// 过滤测试标的
	var filtered []TickerEntry
	for _, e := range allEntries {
		upper := strings.ToUpper(e.Ticker)
		if strings.Contains(strings.ToUpper(e.Name), "TEST") {
			continue
		}
		if strings.HasSuffix(upper, "Z") && len(upper) > 4 {
			// 跳过可能的测试代码
		}
		filtered = append(filtered, e)
	}

	slog.Info("ticker 过滤后", "total", len(filtered))

	inserted, err := writeTickersToDB(ctx, pool, filtered)
	if err != nil {
		return fmt.Errorf("写入数据库失败: %w", err)
	}

	slog.Info("全量 ticker 获取完成", "inserted", inserted)
	return nil
}
