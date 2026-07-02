package twelvedata

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
)

const baseURL = "https://api.twelvedata.com"

var httpClient *httpclient.Client

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

	body, err := httpClient.Get(url)
	if err != nil {
		return nil, err
	}

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
		close := parseTwelveFloat(v.Close)
		if close == 0 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date:          v.Datetime,
			Open:          parseTwelveFloat(v.Open),
			High:          parseTwelveFloat(v.High),
			Low:           parseTwelveFloat(v.Low),
			Close:         close,
			Volume:        parseTwelveInt(v.Volume),
			AdjustedClose: close,
		})
	}
	return prices, nil
}

func (p *twelveDataProvider) SearchTicker(query string) ([]provider.TickerInfo, error) {
	return nil, fmt.Errorf("twelvedata SearchTicker 未实现（使用 Finnhub 或 yfinance 搜索）")
}

func parseTwelveFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

func parseTwelveInt(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return int64(f)
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
