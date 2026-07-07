package finnhub

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"

	"github.com/sony/gobreaker"
)

const baseURL = "https://finnhub.io/api/v1"

var (
	httpClient *httpclient.Client
	breaker    *gobreaker.CircuitBreaker
)

func init() {
	httpClient = httpclient.New("finnhub", httpclient.Options{
		RequestDelay: 1100 * time.Millisecond,
	})
	breaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "finnhub",
		MaxRequests: 3,
		Interval:    60 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5 ||
				(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			slog.Warn("finnhub 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
		},
	})
}

type finnhubProvider struct {
	apiKey string
}

func NewProvider() provider.Provider {
	key := os.Getenv("FINNHUB_API_KEY")
	if key == "" {
		slog.Warn("FINNHUB_API_KEY 未设置，finnhub 数据源不可用")
		return nil
	}
	return &finnhubProvider{apiKey: key}
}

func (p *finnhubProvider) Name() string {
	return "finnhub"
}

func (p *finnhubProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	startUnix := dateToUnix(startDate)
	endUnix := dateToUnix(endDate)

	url := fmt.Sprintf("%s/stock/candle?symbol=%s&resolution=D&from=%d&to=%d&token=%s",
		baseURL, ticker, startUnix, endUnix, p.apiKey)

	result, err := breaker.Execute(func() (interface{}, error) {
		body, err := httpClient.Get(url)
		if err != nil {
			return nil, err
		}

		var resp candleResponse
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}

		if resp.S == "no_data" {
			return []provider.DailyPrice{}, nil
		}
		if resp.S != "ok" {
			return nil, fmt.Errorf("Finnhub API 错误: status=%s", resp.S)
		}

		n := len(resp.T)
		if n == 0 {
			return []provider.DailyPrice{}, nil
		}

		prices := make([]provider.DailyPrice, 0, n)
		for i := 0; i < n; i++ {
			if i >= len(resp.C) {
				break
			}
			if resp.C[i] == 0 {
				continue
			}
			prices = append(prices, provider.DailyPrice{
				Date:          time.Unix(resp.T[i], 0).Format("2006-01-02"),
				Open:          resp.O[i],
				High:          resp.H[i],
				Low:           resp.L[i],
				Close:         resp.C[i],
				Volume:        int64(resp.V[i]),
				AdjustedClose: resp.C[i],
			})
		}
		return prices, nil
	})
	if err != nil {
		return nil, err
	}
	return result.([]provider.DailyPrice), nil
}

func (p *finnhubProvider) SearchTicker(query string) ([]provider.TickerInfo, error) {
	url := fmt.Sprintf("%s/search?q=%s&token=%s", baseURL, query, p.apiKey)

	result, err := breaker.Execute(func() (interface{}, error) {
		body, err := httpClient.Get(url)
		if err != nil {
			return nil, err
		}

		var resp searchResponse
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}

		var results []provider.TickerInfo
		for _, r := range resp.Result {
			results = append(results, provider.TickerInfo{
				Ticker: r.Symbol,
				Name:   r.Description,
				Market: "美股",
			})
		}
		return results, nil
	})
	if err != nil {
		return nil, err
	}
	return result.([]provider.TickerInfo), nil
}

type candleResponse struct {
	S string    `json:"s"`
	T []int64   `json:"t"`
	O []float64 `json:"o"`
	H []float64 `json:"h"`
	L []float64 `json:"l"`
	C []float64 `json:"c"`
	V []float64 `json:"v"`
}

type searchResponse struct {
	Result []struct {
		Symbol      string `json:"symbol"`
		Description string `json:"description"`
		Type        string `json:"type"`
	} `json:"result"`
}

func dateToUnix(dateStr string) int64 {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return 0
	}
	return t.Unix()
}
