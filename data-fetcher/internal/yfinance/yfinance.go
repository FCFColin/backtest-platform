package yfinance

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/sony/gobreaker"
)

// Fetcher 美股数据获取器
// 企业理由（ADR-008）：替代 Python yfinance SDK，统一运行时为 Go。

// DailyPrice 美股日线行情数据
type DailyPrice struct {
	Date          string  `json:"date"`
	Open          float64 `json:"open"`
	High          float64 `json:"high"`
	Low           float64 `json:"low"`
	Close         float64 `json:"close"`
	Volume        int64   `json:"volume"`
	AdjustedClose float64 `json:"adjustedClose"`
}

// TickerInfo 美股标的搜索结果
type TickerInfo struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

const (
	chartBaseURL   = "https://query1.finance.yahoo.com/v8/finance/chart"
	searchBaseURL  = "https://query1.finance.yahoo.com/v1/finance/search"
	connectTimeout = 10 * time.Second
	readTimeout    = 30 * time.Second
	maxRetries     = 3
)

var breaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
	Name:        "yfinance",
	MaxRequests: 3,
	Interval:    60 * time.Second,
	Timeout:     30 * time.Second,
	ReadyToTrip: func(counts gobreaker.Counts) bool {
		return counts.ConsecutiveFailures >= 5 ||
			(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
	},
	OnStateChange: func(name string, from, to gobreaker.State) {
		slog.Warn("yfinance 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
	},
})

// FetchStockDaily 获取美股日线行情
// Yahoo Finance API: GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1={start}&period2={end}&interval=1d
func FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error) {
	startUnix, err := dateToUnix(startDate)
	if err != nil {
		return nil, fmt.Errorf("无效的起始日期 %s: %w", startDate, err)
	}
	endUnix, err := dateToUnix(endDate)
	if err != nil {
		return nil, fmt.Errorf("无效的结束日期 %s: %w", endDate, err)
	}

	url := fmt.Sprintf("%s/%s?period1=%d&period2=%d&interval=1d",
		chartBaseURL, ticker, startUnix, endUnix)

	result, err := breaker.Execute(func() (interface{}, error) {
		return doWithRetry(url, parseChartResponse)
	})
	if err != nil {
		return nil, fmt.Errorf("yfinance FetchStockDaily 失败: %w", err)
	}
	return result.([]DailyPrice), nil
}

// SearchTicker 搜索美股标的
// Yahoo Finance API: GET https://query1.finance.yahoo.com/v1/finance/search?q={query}
func SearchTicker(query string) ([]TickerInfo, error) {
	url := fmt.Sprintf("%s?q=%s&quotesCount=20&newsCount=0", searchBaseURL, query)

	result, err := breaker.Execute(func() (interface{}, error) {
		return doWithRetry(url, parseSearchResponse)
	})
	if err != nil {
		return nil, fmt.Errorf("yfinance SearchTicker 失败: %w", err)
	}
	return result.([]TickerInfo), nil
}

// doWithRetry 执行 HTTP 请求，带指数退避重试
func doWithRetry(url string, parser func([]byte) (interface{}, error)) (interface{}, error) {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*attempt) * time.Second
			slog.Info("yfinance 重试", "attempt", attempt+1, "backoff_ms", backoff.Milliseconds())
			time.Sleep(backoff)
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("创建请求失败: %w", err)
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		client := &http.Client{Timeout: connectTimeout + readTimeout}
		resp, err := client.Do(req)
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

// chartResponse Yahoo Chart API 响应结构
type chartResponse struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency             string  `json:"currency"`
				Symbol               string  `json:"symbol"`
				RegularMarketPrice   float64 `json:"regularMarketPrice"`
				ChartPreviousClose   float64 `json:"chartPreviousClose"`
			} `json:"meta"`
			Timestamp  []int64   `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					Open   []interface{} `json:"open"`
					High   []interface{} `json:"high"`
					Low    []interface{} `json:"low"`
					Close  []interface{} `json:"close"`
					Volume []interface{} `json:"volume"`
				} `json:"quote"`
				Adjclose []struct {
					Adjclose []interface{} `json:"adjclose"`
				} `json:"adjclose"`
			} `json:"indicators"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"chart"`
}

// parseChartResponse 解析 Yahoo Chart API 响应
func parseChartResponse(body []byte) (interface{}, error) {
	var resp chartResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	if resp.Chart.Error != nil {
		return nil, fmt.Errorf("Yahoo API 错误: %v", resp.Chart.Error)
	}

	if len(resp.Chart.Result) == 0 {
		return []DailyPrice{}, nil
	}

	result := resp.Chart.Result[0]
	timestamps := result.Timestamp
	if len(timestamps) == 0 {
		return []DailyPrice{}, nil
	}

	quotes := result.Indicators.Quote
	if len(quotes) == 0 {
		return []DailyPrice{}, nil
	}
	quote := quotes[0]

	var adjClose []interface{}
	if len(result.Indicators.Adjclose) > 0 {
		adjClose = result.Indicators.Adjclose[0].Adjclose
	}

	var prices []DailyPrice
	for i, ts := range timestamps {
		if i >= len(quote.Close) {
			break
		}
		closeVal := toFloat64(quote.Close[i])
		if closeVal == 0 {
			continue // 跳过空数据点
		}

		p := DailyPrice{
			Date:          time.Unix(ts, 0).Format("2006-01-02"),
			Open:          toFloat64Safe(quote.Open, i),
			High:          toFloat64Safe(quote.High, i),
			Low:           toFloat64Safe(quote.Low, i),
			Close:         closeVal,
			Volume:        toInt64Safe(quote.Volume, i),
			AdjustedClose: toFloat64Safe(adjClose, i),
		}
		if p.AdjustedClose == 0 {
			p.AdjustedClose = p.Close
		}
		prices = append(prices, p)
	}
	return prices, nil
}

// searchResponse Yahoo Search API 响应结构
type searchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		ShortName string `json:"shortname"`
		LongName  string `json:"longname"`
		QuoteType string `json:"quoteType"`
		Exchange  string `json:"exchange"`
	} `json:"quotes"`
}

// parseSearchResponse 解析 Yahoo Search API 响应
func parseSearchResponse(body []byte) (interface{}, error) {
	var resp searchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	var results []TickerInfo
	for _, q := range resp.Quotes {
		name := q.ShortName
		if name == "" {
			name = q.LongName
		}
		results = append(results, TickerInfo{
			Ticker: q.Symbol,
			Name:   name,
			Market: "美股",
		})
	}
	return results, nil
}

// dateToUnix 将 YYYY-MM-DD 日期转为 Unix 时间戳
func dateToUnix(dateStr string) (int64, error) {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return 0, err
	}
	return t.Unix(), nil
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
		return 0
	}
}

func toFloat64Safe(arr []interface{}, idx int) float64 {
	if idx >= len(arr) || arr[idx] == nil {
		return 0
	}
	return toFloat64(arr[idx])
}

func toInt64Safe(arr []interface{}, idx int) int64 {
	if idx >= len(arr) || arr[idx] == nil {
		return 0
	}
	switch val := arr[idx].(type) {
	case float64:
		return int64(val)
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	default:
		return 0
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
