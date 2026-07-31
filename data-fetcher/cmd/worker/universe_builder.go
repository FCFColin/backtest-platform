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
    "data-fetcher/internal/provider"
)
const (
	nasdaqListURL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
	otherListURL  = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
)
type TickerEntry struct {
	Ticker   string
	Name     string
	Category string
	Market   string
}
func downloadURL(url string) ([]byte, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil { return nil, fmt.Errorf("下载 %s 失败: %w", url, err) }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return nil, fmt.Errorf("下载 %s 返回状态码 %d", url, resp.StatusCode) }
	return io.ReadAll(resp.Body)
}
func parsePipeDelimited(data []byte, skipHeaders bool) [][]string {
	var rows [][]string
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" { continue }
		if skipHeaders && strings.HasPrefix(line, "Symbol|") { continue }
		if strings.HasPrefix(line, "File Creation") { continue }
		fields := strings.Split(line, "|")
		for i := range fields { fields[i] = strings.TrimSpace(fields[i]) }
		rows = append(rows, fields)
	}
	return rows
}
func parseNASDAQList(data []byte) []TickerEntry {
	var entries []TickerEntry
	for _, fields := range parsePipeDelimited(data, true) {
		if len(fields) < 2 { continue }
		symbol := fields[0]
		if symbol == "" { continue }
		name := ""
if len(fields) > 1 { name = fields[1] }
		isTest := len(fields) > 3 && strings.ToUpper(fields[3]) == "Y"
		isETF := len(fields) > 6 && strings.ToUpper(fields[6]) == "Y"
		if isTest { continue }
		category := "US Equity"
if isETF { category = "ETF" }
		entries = append(entries, TickerEntry{ Ticker: symbol, Name: name, Category: category, Market: "US", })
	}
	return entries
}
func parseOtherList(data []byte) []TickerEntry {
	var entries []TickerEntry
	for _, fields := range parsePipeDelimited(data, true) {
		if len(fields) < 2 { continue }
		symbol := fields[0]
		if symbol == "" { continue }
		name := ""
if len(fields) > 2 { name = fields[2] }
		isETF := len(fields) > 5 && strings.ToUpper(fields[5]) == "Y"
		category := "US Equity"
if isETF { category = "ETF" }
		entries = append(entries, TickerEntry{ Ticker: symbol, Name: name, Category: category, Market: "US", })
	}
	return entries
}
func loadTickersFromFile(path string) ([]TickerEntry, error) {
	f, err := os.Open(path)
	if err != nil { return nil, fmt.Errorf("打开文件 %s 失败: %w", path, err) }
	defer f.Close()
	var entries []TickerEntry
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") { continue }
		var fields []string
		switch {
		case strings.Contains(line, "|"): fields = strings.Split(line, "|")
		case strings.Contains(line, ","): fields = strings.Split(line, ",")
		case strings.Contains(line, "\t"): fields = strings.Split(line, "\t")
		default: fields = []string{line}
		}
		for i := range fields { fields[i] = strings.TrimSpace(fields[i]) }
		ticker := fields[0]
		if ticker == "" { continue }
		name := ""
if len(fields) > 1 { name = fields[1] }
		category := ""
if len(fields) > 2 { category = fields[2] }
if category == "" { category = "Custom" }
		entries = append(entries, TickerEntry{ Ticker: ticker, Name: name, Category: category, Market: "Custom", })
	}
	slog.Info("从文件加载 ticker", "path", path, "count", len(entries))
	return entries, nil
}
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
	for _, e := range seen { result = append(result, e) }
	return result
}
func writeTickersToDB(ctx context.Context, pool *pgxpool.Pool, entries []TickerEntry) (int, error) {
	inserted := 0
	for _, e := range entries {
		category := e.Category
if category == "" { category = "Custom" }
		_, err := pool.Exec(ctx, `
			INSERT INTO tickers (ticker, category, market, exchange)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (ticker) DO UPDATE SET
				category = CASE WHEN tickers.category = '' OR tickers.category = 'Custom' THEN EXCLUDED.category ELSE tickers.category END,
				market = CASE WHEN tickers.market = '' THEN EXCLUDED.market ELSE tickers.market END
		`, e.Ticker, category, e.Market, provider.DeriveExchange(e.Ticker))
		if err != nil {
			slog.Warn("插入 ticker 失败", "ticker", e.Ticker, "error", err)
			continue
		}
		inserted++
	}
	return inserted, nil
}
func cmdFetchUniverse(cfg *WorkerConfig, filePath string) error {
	ctx := context.Background()
	pool, err := initDB(ctx, cfg.DatabaseURL)
	if err != nil { return fmt.Errorf("数据库连接失败: %w", err) }
	defer pool.Close()
	var allEntries []TickerEntry
	if filePath != "" {
		entries, err := loadTickersFromFile(filePath)
		if err != nil { return err }
		allEntries = entries
	} else {
		slog.Info("从 NASDAQ/NYSE/AMEX 下载 ticker 列表...")
		nasdaqData, err := downloadURL(nasdaqListURL)
		if err != nil { return fmt.Errorf("获取 NASDAQ 列表失败: %w", err) }
		nasdaqEntries := parseNASDAQList(nasdaqData)
		slog.Info("NASDAQ 列表", "count", len(nasdaqEntries))
		otherData, err := downloadURL(otherListURL)
		if err != nil { return fmt.Errorf("获取 Other 列表失败: %w", err) }
		otherEntries := parseOtherList(otherData)
		slog.Info("NYSE/AMEX 列表", "count", len(otherEntries))
		allEntries = mergeAndDedup(nasdaqEntries, otherEntries)
	}
	var filtered []TickerEntry
	for _, e := range allEntries {
		upper := strings.ToUpper(e.Ticker)
		if strings.Contains(strings.ToUpper(e.Name), "TEST") { continue }
		if strings.HasSuffix(upper, "Z") && len(upper) > 4 {
		}
		filtered = append(filtered, e)
	}
	slog.Info("ticker 过滤后", "total", len(filtered))
	inserted, err := writeTickersToDB(ctx, pool, filtered)
	if err != nil { return fmt.Errorf("写入数据库失败: %w", err) }
	slog.Info("全量 ticker 获取完成", "inserted", inserted)
	return nil
}
type TickerMeta struct {
	Ticker   string
	Name     string
	Market   string
	Category string
}
var DefaultETFUniverse = []TickerMeta{
	{Ticker: "SHY", Name: "1-3 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "IEI", Name: "3-7 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "IEF", Name: "7-10 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "TLT", Name: "20+ Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "TIP", Name: "TIPS Bond", Market: "US", Category: "Bond"},
	{Ticker: "GOVT", Name: "US Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "MBB", Name: "MBS Bond", Market: "US", Category: "Bond"},
	{Ticker: "LQD", Name: "Investment Grade Corporate Bond", Market: "US", Category: "Bond"},
	{Ticker: "HYG", Name: "High Yield Corporate Bond", Market: "US", Category: "Bond"},
	{Ticker: "BND", Name: "Total Bond Market", Market: "US", Category: "Bond"},
	{Ticker: "AGG", Name: "US Aggregate Bond", Market: "US", Category: "Bond"},
	{Ticker: "SPY", Name: "S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "VOO", Name: "Vanguard S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "IVV", Name: "iShares Core S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "VTI", Name: "Total Stock Market", Market: "US", Category: "US Equity"},
	{Ticker: "VTV", Name: "Value", Market: "US", Category: "US Equity"},
	{Ticker: "VUG", Name: "Growth", Market: "US", Category: "US Equity"},
	{Ticker: "VO", Name: "Mid-Cap", Market: "US", Category: "US Equity"},
	{Ticker: "VV", Name: "Large-Cap", Market: "US", Category: "US Equity"},
	{Ticker: "QQQ", Name: "Nasdaq 100", Market: "US", Category: "US Equity"},
	{Ticker: "DIA", Name: "Dow Jones", Market: "US", Category: "US Equity"},
	{Ticker: "IWM", Name: "Russell 2000", Market: "US", Category: "US Equity"},
	{Ticker: "IJR", Name: "S&P Small-Cap 600", Market: "US", Category: "US Equity"},
	{Ticker: "SCHD", Name: "US Dividend Equity", Market: "US", Category: "US Equity"},
	{Ticker: "VEA", Name: "Developed Markets", Market: "US", Category: "International"},
	{Ticker: "VWO", Name: "Emerging Markets", Market: "US", Category: "International"},
	{Ticker: "VXUS", Name: "Total International", Market: "US", Category: "International"},
	{Ticker: "EEM", Name: "Emerging Markets", Market: "US", Category: "International"},
	{Ticker: "VT", Name: "Total World", Market: "US", Category: "International"},
	{Ticker: "IEMB", Name: "Emerging Markets Bond", Market: "US", Category: "Bond"},
	{Ticker: "GLD", Name: "Gold", Market: "US", Category: "Commodity"},
	{Ticker: "SLV", Name: "Silver", Market: "US", Category: "Commodity"},
	{Ticker: "DBC", Name: "Commodity Index", Market: "US", Category: "Commodity"},
	{Ticker: "USO", Name: "Crude Oil", Market: "US", Category: "Commodity"},
	{Ticker: "DGL", Name: "Gold", Market: "US", Category: "Commodity"},
	{Ticker: "GSG", Name: "Commodity", Market: "US", Category: "Commodity"},
	{Ticker: "XLK", Name: "Technology", Market: "US", Category: "Sector"},
	{Ticker: "XLF", Name: "Financials", Market: "US", Category: "Sector"},
	{Ticker: "XLE", Name: "Energy", Market: "US", Category: "Sector"},
	{Ticker: "XLV", Name: "Health Care", Market: "US", Category: "Sector"},
	{Ticker: "XLI", Name: "Industrials", Market: "US", Category: "Sector"},
	{Ticker: "XLP", Name: "Consumer Staples", Market: "US", Category: "Sector"},
	{Ticker: "XLY", Name: "Consumer Discretionary", Market: "US", Category: "Sector"},
	{Ticker: "XLU", Name: "Utilities", Market: "US", Category: "Sector"},
	{Ticker: "XLB", Name: "Materials", Market: "US", Category: "Sector"},
	{Ticker: "XLRE", Name: "Real Estate", Market: "US", Category: "Sector"},
	{Ticker: "XLC", Name: "Communication Services", Market: "US", Category: "Sector"},
	{Ticker: "VNQ", Name: "REIT", Market: "US", Category: "Real Estate"},
	{Ticker: "ARKK", Name: "Innovation", Market: "US", Category: "US Equity"},
	{Ticker: "BITO", Name: "Bitcoin Strategy", Market: "US", Category: "Alternative"},
}
