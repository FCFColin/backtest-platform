package yfinance

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
)

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
}

var (
	breaker    = provider.NewProviderBreaker("yfinance", 3)
	httpClient *httpclient.Client
)

func init() {
	httpClient = httpclient.New("yfinance", httpclient.Options{
		RequestDelay: 800 * time.Millisecond,
		UserAgents:   userAgents,
		ExtraHeaders: map[string]string{
			"Accept":          "text/html,application/json,application/xml,*/*",
			"Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
			"Origin":          "https://finance.yahoo.com",
			"Referer":         "https://finance.yahoo.com/",
		},
	})
}

type yahooProvider struct{}

func NewProvider() provider.Provider {
	return &yahooProvider{}
}

func (p *yahooProvider) Name() string {
	return "yfinance"
}

func (p *yahooProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	startUnix, err := dateToUnix(startDate)
	if err != nil {
		return nil, fmt.Errorf("无效的起始日期 %s: %w", startDate, err)
	}
	endUnix, err := dateToUnix(endDate)
	if err != nil {
		return nil, fmt.Errorf("无效的结束日期 %s: %w", endDate, err)
	}

	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d",
		ticker, startUnix, endUnix)

	prices, err := httpclient.DoGetWithBreaker(breaker, httpClient, url, parseChartResponse)
	if err != nil {
		return nil, fmt.Errorf("yfinance FetchStockDaily 失败: %w", err)
	}
	return prices, nil
}

func (p *yahooProvider) SearchTicker(query string) ([]provider.TickerInfo, error) {
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v1/finance/search?q=%s&quotesCount=20&newsCount=0", query)

	results, err := httpclient.DoGetWithBreaker(breaker, httpClient, url, parseSearchResponse)
	if err != nil {
		return nil, fmt.Errorf("yfinance SearchTicker 失败: %w", err)
	}
	return results, nil
}

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

func parseChartResponse(body []byte) ([]provider.DailyPrice, error) {
	var resp chartResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	if resp.Chart.Error != nil {
		return nil, fmt.Errorf("Yahoo API 错误: %v", resp.Chart.Error)
	}

	if len(resp.Chart.Result) == 0 || len(resp.Chart.Result[0].Timestamp) == 0 {
		return []provider.DailyPrice{}, nil
	}

	result := resp.Chart.Result[0]
	quotes := result.Indicators.Quote
	if len(quotes) == 0 {
		return []provider.DailyPrice{}, nil
	}
	quote := quotes[0]

	var adjClose []interface{}
	if len(result.Indicators.Adjclose) > 0 {
		adjClose = result.Indicators.Adjclose[0].Adjclose
	}

	var prices []provider.DailyPrice
	for i, ts := range result.Timestamp {
		if i >= len(quote.Close) {
			break
		}
		closeVal := toFloat64(quote.Close[i])
		if closeVal == 0 {
			continue
		}
		p := provider.DailyPrice{
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

type searchResponse struct {
	Quotes []struct {
		Symbol    string `json:"symbol"`
		ShortName string `json:"shortname"`
		LongName  string `json:"longname"`
		QuoteType string `json:"quoteType"`
		Exchange  string `json:"exchange"`
	} `json:"quotes"`
}

func parseSearchResponse(body []byte) ([]provider.TickerInfo, error) {
	var resp searchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	var results []provider.TickerInfo
	for _, q := range resp.Quotes {
		name := q.ShortName
		if name == "" {
			name = q.LongName
		}
		results = append(results, provider.TickerInfo{
			Ticker: q.Symbol,
			Name:   name,
			Market: "美股",
		})
	}
	return results, nil
}

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
