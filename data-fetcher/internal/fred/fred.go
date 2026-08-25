// Package fred 提供 FRED (St. Louis Fed) 数据拉取客户端。
// U-2 Phase 1：仅支持 series observations JSON 接口（DGS3MO 等利率序列）。
package fred

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"time"

	"data-fetcher/internal/httpclient"
)

const (
	defaultSeries = "DGS3MO"
)

// RatePoint 单日利率观测（小数形式：FRED 返回百分数 4.28 → 0.0428）。
type RatePoint struct {
	Date string // YYYY-MM-DD
	Rate float64
}

type Client struct {
	apiKey string
	base   string
	http   *httpclient.Client
}

func New(apiKey string, hc *httpclient.Client) *Client {
	return NewWithBase(apiKey, "https://api.stlouisfed.org", hc)
}
func NewWithBase(apiKey, base string, hc *httpclient.Client) *Client {
	return &Client{apiKey: apiKey, base: base, http: hc}
}

type observationsResp struct {
	Observations []struct {
		Date  string `json:"date"`
		Value string `json:"value"`
	} `json:"observations"`
}

// FetchDailyRates 拉取 [start,end] 区间日频观测；FRED 缺失日（value="."）跳过。
func (c *Client) FetchDailyRates(ctx context.Context, series, start, end string) ([]RatePoint, error) {
	if series == "" {
		series = defaultSeries
	}
	q := url.Values{}
	q.Set("series_id", series)
	q.Set("api_key", c.apiKey)
	q.Set("file_type", "json")
	q.Set("sort_order", "asc")
	q.Set("observation_start", start)
	q.Set("observation_end", end)
	body, err := c.http.Get(c.base + "/fred/series/observations?" + q.Encode())
	if err != nil {
		return nil, fmt.Errorf("fred 请求失败: %w", err)
	}
	return ParseObservations(body)
}

// ParseObservations 纯函数便于单测：百分数→小数，"." 与非法值跳过。
func ParseObservations(body []byte) ([]RatePoint, error) {
	var resp observationsResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("fred JSON 解析失败: %w", err)
	}
	out := make([]RatePoint, 0, len(resp.Observations))
	for _, o := range resp.Observations {
		if o.Value == "." || o.Value == "" {
			continue
		}
		pct, err := strconv.ParseFloat(o.Value, 64)
		if err != nil || math.IsNaN(pct) {
			continue
		}
		if _, err := time.Parse("2006-01-02", o.Date); err != nil {
			continue
		}
		out = append(out, RatePoint{Date: o.Date, Rate: pct / 100.0})
	}
	return out, nil
}
