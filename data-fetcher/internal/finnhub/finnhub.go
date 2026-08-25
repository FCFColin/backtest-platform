package finnhub

import (
	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/providerutil"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"
)

const baseURL = "https://finnhub.io/api/v1"

var base = provider.NewBaseProvider("finnhub", httpclient.Options{RequestDelay: 1100 * time.Millisecond})

type finnhubProvider struct {
	*provider.BaseProvider
	apiKey string
}

func NewProvider() provider.Provider {
	key := os.Getenv("FINNHUB_API_KEY")
	if key == "" {
		slog.Warn("FINNHUB_API_KEY 未设置，finnhub 数据源不可用")
		return nil
	}
	return &finnhubProvider{BaseProvider: &base, apiKey: key}
}
func (p *finnhubProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	startUnix, err := providerutil.DateToUnix(startDate)
	if err != nil {
		return nil, fmt.Errorf("解析开始日期 %q 失败: %w", startDate, err)
	}
	endUnix, err := providerutil.DateToUnix(endDate)
	if err != nil {
		return nil, fmt.Errorf("解析结束日期 %q 失败: %w", endDate, err)
	}
	url := fmt.Sprintf("%s/stock/candle?symbol=%s&resolution=D&from=%d&to=%d",
		baseURL, ticker, startUnix, endUnix)
	return httpclient.DoGetWithBreaker(base.Breaker, base.HTTPClient, url,
		map[string]string{"X-Finnhub-Token": p.apiKey}, parseCandleResponse)
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

func parseCandleResponse(body []byte) ([]provider.DailyPrice, error) {
	var resp candleResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}
	if resp.S == "no_data" {
		return []provider.DailyPrice{}, nil
	}
	if resp.S != "ok" {
		return nil, fmt.Errorf("finnhub API 错误: status=%s", resp.S)
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
			Date: time.Unix(resp.T[i], 0).UTC().Format("2006-01-02"), Open: resp.O[i],
			High: resp.H[i], Low: resp.L[i], Close: resp.C[i],
			Volume: int64(resp.V[i])}) // R-12/A4：finnhub candle 为未复权价，AdjustedClose 置 nil（不冒充复权）
	}
	return prices, nil
}
