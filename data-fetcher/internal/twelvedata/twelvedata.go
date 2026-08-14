package twelvedata

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

const baseURL = "https://api.twelvedata.com"

var base = provider.NewBaseProvider("twelvedata", httpclient.Options{RequestDelay: 7600 * time.Millisecond})

type twelveDataProvider struct {
	*provider.BaseProvider
	apiKey string
}

func NewProvider() provider.Provider {
	key := os.Getenv("TWELVE_DATA_API_KEY")
	if key == "" {
		slog.Warn("TWELVE_DATA_API_KEY 未设置，twelvedata 数据源不可用")
		return nil
	}
	return &twelveDataProvider{BaseProvider: &base, apiKey: key}
}
func (p *twelveDataProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	// adjust=split：API 返回拆股调整后的 OHLC，与 AdjustedClose=Close 标注一致（此前未复权数据被误标为复权）
	url := fmt.Sprintf("%s/time_series?symbol=%s&interval=1day&outputsize=5000&adjust=split",
		baseURL, ticker)
	return httpclient.DoGetWithBreaker(base.Breaker, base.HTTPClient, url,
		map[string]string{"X-TwelveData-API-Key": p.apiKey},
		func(body []byte) ([]provider.DailyPrice, error) {
			return parseTimeSeries(body, startDate, endDate)
		})
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

func parseTimeSeries(body []byte, startDate, endDate string) ([]provider.DailyPrice, error) {
	var resp timeSeriesResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}
	if resp.Status == "error" {
		msg := resp.Message
		if msg == "" {
			msg = "unknown error"
		}
		return nil, fmt.Errorf("twelve data API 错误: %s", msg)
	}
	if resp.Status != "ok" {
		return nil, fmt.Errorf("twelve data API 异常状态: %s", resp.Status)
	}
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, fmt.Errorf("解析开始日期 %q 失败: %w", startDate, err)
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, fmt.Errorf("解析结束日期 %q 失败: %w", endDate, err)
	}
	var prices []provider.DailyPrice
	for _, v := range resp.Values {
		t, err := time.Parse("2006-01-02", v.Datetime)
		if err != nil {
			if t, err = time.Parse("2006-01-02 15:04:05", v.Datetime); err != nil {
				continue
			}
		}
		if t.Before(start) || t.After(end) {
			continue
		}
		close := providerutil.ParseStringFloat(v.Close)
		if close == 0 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date: t.Format("2006-01-02"), Open: providerutil.ParseStringFloat(v.Open),
			High: providerutil.ParseStringFloat(v.High),
			Low:  providerutil.ParseStringFloat(v.Low), Close: close,
			Volume: providerutil.ParseStringInt(v.Volume), AdjustedClose: close})
	}
	return prices, nil
}
