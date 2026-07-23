package twelvedata

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/providerutil"
)

const baseURL = "https://api.twelvedata.com"

var (
	httpClient *httpclient.Client
	breaker    = provider.NewProviderBreaker("twelvedata", 3)
)

func init() {
	httpClient = httpclient.New("twelvedata", httpclient.Options{
		RequestDelay: 7600 * time.Millisecond,
	})
}

type twelveDataProvider struct {
	apiKey string
}

func NewProvider() provider.Provider {
	key := os.Getenv("TWELVE_DATA_API_KEY")
	if key == "" {
		slog.Warn("TWELVE_DATA_API_KEY 未设置，twelvedata 数据源不可用")
		return nil
	}
	return &twelveDataProvider{apiKey: key}
}

func (p *twelveDataProvider) Name() string {
	return "twelvedata"
}

func (p *twelveDataProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	url := fmt.Sprintf("%s/time_series?symbol=%s&interval=1day&outputsize=5000&apikey=%s",
		baseURL, ticker, p.apiKey)

	parse := func(body []byte) ([]provider.DailyPrice, error) {
		var resp timeSeriesResponse
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("JSON 解析失败: %w", err)
		}

		if resp.Status == "error" {
			msg := resp.Message
			if msg == "" {
				msg = "unknown error"
			}
			return nil, fmt.Errorf("Twelve Data API 错误: %s", msg)
		}
		if resp.Status != "ok" {
			return nil, fmt.Errorf("Twelve Data API 异常状态: %s", resp.Status)
		}

		start, _ := time.Parse("2006-01-02", startDate)
		end, _ := time.Parse("2006-01-02", endDate)

		var prices []provider.DailyPrice
		for _, v := range resp.Values {
			t, err := time.Parse("2006-01-02", v.Datetime)
			if err != nil {
				continue
			}
			if t.Before(start) || t.After(end) {
				continue
			}
			close := providerutil.ParseStringFloat(v.Close)
			if close == 0 {
				continue
			}
			prices = append(prices, provider.DailyPrice{
				Date:          v.Datetime,
				Open:          providerutil.ParseStringFloat(v.Open),
				High:          providerutil.ParseStringFloat(v.High),
				Low:           providerutil.ParseStringFloat(v.Low),
				Close:         close,
				Volume:        providerutil.ParseStringInt(v.Volume),
				AdjustedClose: close,
			})
		}
		return prices, nil
	}

	return httpclient.DoGetWithBreaker(breaker, httpClient, url, parse)
}

func (p *twelveDataProvider) SearchTicker(query string) ([]provider.TickerInfo, error) {
	return nil, fmt.Errorf("twelvedata SearchTicker 未实现（使用 Finnhub 或 yfinance 搜索）")
}

type timeSeriesResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Values  []struct {
		Datetime string `json:"datetime"`
		Open     string `json:"open"`
		High     string `json:"high"`
		Low      string `json:"low"`
		Close    string `json:"close"`
		Volume   string `json:"volume"`
	} `json:"values"`
}
