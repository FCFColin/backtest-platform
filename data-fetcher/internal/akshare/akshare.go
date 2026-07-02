package akshare

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"

	"github.com/sony/gobreaker"
)

// Fetcher A股数据获取器
// 企业理由（ADR-008）：替代 Python akshare SDK，消除子进程开销和双运行时依赖。
// 权衡：Go HTTP 客户端不如 Python SDK 完整，但核心行情数据获取已满足需求。

// DailyPrice A股日线行情数据
type DailyPrice struct {
	Date          string  `json:"date"`
	Open          float64 `json:"open"`
	High          float64 `json:"high"`
	Low           float64 `json:"low"`
	Close         float64 `json:"close"`
	Volume        int64   `json:"volume"`
	AdjustedClose float64 `json:"adjustedClose"`
}

// TickerInfo A股标的搜索结果
type TickerInfo struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

const (
	baseURL        = "https://akshare.akfamily.xyz"
	connectTimeout = 10 * time.Second
	readTimeout    = 30 * time.Second
	maxRetries     = 3
)

var breaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
	Name:        "akshare",
	MaxRequests: 3,
	Interval:    60 * time.Second,
	Timeout:     30 * time.Second,
	ReadyToTrip: func(counts gobreaker.Counts) bool {
		return counts.ConsecutiveFailures >= 5 ||
			(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
	},
	OnStateChange: func(name string, from, to gobreaker.State) {
		slog.Warn("akshare 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
	},
})

// FetchStockDaily 获取A股日线行情
// 调用 akshare REST API: GET /api/public/stock_zh_a_hist?symbol={ticker}&period=daily&start_date={start}&end_date={end}
func FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error) {
	url := fmt.Sprintf("%s/api/public/stock_zh_a_hist?symbol=%s&period=daily&start_date=%s&end_date=%s",
		baseURL, ticker, startDate, endDate)

	result, err := breaker.Execute(func() (interface{}, error) {
		return doWithRetry(url, parseDailyPrices)
	})
	if err != nil {
		return nil, fmt.Errorf("akshare FetchStockDaily 失败: %w", err)
	}
	return result.([]DailyPrice), nil
}

// SearchTicker 搜索A股标的
// 调用 akshare REST API: GET /api/public/stock_zh_a_spot_em
func SearchTicker(query string) ([]TickerInfo, error) {
	url := fmt.Sprintf("%s/api/public/stock_zh_a_spot_em", baseURL)

	result, err := breaker.Execute(func() (interface{}, error) {
		return doWithRetry(url, func(body []byte) (interface{}, error) {
			return parseTickerSearch(body, query)
		})
	})
	if err != nil {
		return nil, fmt.Errorf("akshare SearchTicker 失败: %w", err)
	}
	return result.([]TickerInfo), nil
}

// doWithRetry 执行 HTTP 请求，带指数退避重试
func doWithRetry(url string, parser func([]byte) (interface{}, error)) (interface{}, error) {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// 企业理由（ADR-028）：指数退避 + jitter 避免重试风暴（thundering herd）。
			base := time.Duration(attempt*attempt) * time.Second
			jitter := time.Duration(rand.Int64N(int64(base)/2 + 1))
			backoff := base + jitter
			slog.Info("akshare 重试", "attempt", attempt+1, "backoff_ms", backoff.Milliseconds())
			time.Sleep(backoff)
		}

		client := &http.Client{Timeout: connectTimeout + readTimeout}
		resp, err := client.Get(url)
		if err != nil {
			lastErr = fmt.Errorf("HTTP 请求失败: %w", err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("读取响应体失败: %w", err)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
			continue
		}

		return parser(body)
	}
	return nil, fmt.Errorf("重试 %d 次后仍失败: %w", maxRetries, lastErr)
}

// parseDailyPrices 解析日线行情 API 响应
func parseDailyPrices(body []byte) (interface{}, error) {
	var raw struct {
		Data [][]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	var prices []DailyPrice
	for _, row := range raw.Data {
		if len(row) < 7 {
			continue
		}
		p := DailyPrice{
			Date:          toString(row[0]),
			Open:          toFloat64(row[1]),
			High:          toFloat64(row[2]),
			Low:           toFloat64(row[3]),
			Close:         toFloat64(row[4]),
			Volume:        toInt64(row[5]),
			AdjustedClose: toFloat64(row[6]),
		}
		prices = append(prices, p)
	}
	return prices, nil
}

// parseTickerSearch 解析标的搜索 API 响应
func parseTickerSearch(body []byte, query string) (interface{}, error) {
	var raw struct {
		Data [][]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	var results []TickerInfo
	for _, row := range raw.Data {
		if len(row) < 2 {
			continue
		}
		code := toString(row[0])
		name := toString(row[1])
		// 简单匹配：代码或名称包含查询词
		if containsIgnoreCase(code, query) || containsIgnoreCase(name, query) {
			market := "A股"
			if len(code) > 0 && code[0] == '6' {
				market = "SH"
			} else {
				market = "SZ"
			}
			results = append(results, TickerInfo{
				Ticker: code,
				Name:   name,
				Market: market,
			})
			if len(results) >= 20 {
				break
			}
		}
	}
	return results, nil
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func toFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	default:
		f, _ := strconv.ParseFloat(fmt.Sprintf("%v", v), 64)
		return f
	}
}

func toInt64(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return int64(val)
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	default:
		n, _ := strconv.ParseInt(fmt.Sprintf("%v", v), 10, 64)
		return n
	}
}

func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		(len(s) > 0 && len(substr) > 0 && containsAny(s, substr)))
}

func containsAny(s, substr string) bool {
	sLower := toLower(s)
	subLower := toLower(substr)
	for i := 0; i <= len(sLower)-len(subLower); i++ {
		if sLower[i:i+len(subLower)] == subLower {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		result[i] = c
	}
	return string(result)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
