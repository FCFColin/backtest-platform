package akshare

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/providerutil"
)

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
}

var (
	breaker    = provider.NewProviderBreaker("akshare", 3)
	httpClient *httpclient.Client
)

func init() {
	httpClient = httpclient.New("akshare", httpclient.Options{
		RequestDelay: 600 * time.Millisecond,
		UserAgents:   userAgents,
		ExtraHeaders: map[string]string{
			"Accept":          "application/json,text/plain,*/*",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		},
	})
}

type akshareProvider struct{}

func NewProvider() provider.Provider {
	return &akshareProvider{}
}

func (p *akshareProvider) Name() string {
	return "akshare"
}

// FetchStockDaily 使用东方财富 API 获取 A 股历史日线数据
// ticker 格式：000001_SZ 或 000001.SZ（后缀 _SZ/.SZ=深圳, _SH/.SH=上海）
func (p *akshareProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	code, market := parseCodeAndMarket(ticker)
	secid := fmt.Sprintf("%s.%s", market, code)

	// 东方财富日期格式：YYYYMMDD
	beg := strings.ReplaceAll(startDate, "-", "")
	ed := strings.ReplaceAll(endDate, "-", "")

	url := fmt.Sprintf(
		"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=%s&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=%s&end=%s",
		secid, beg, ed,
	)

	result, err := breaker.Execute(func() (interface{}, error) {
		return doWithRetry(url)
	})
	if err != nil {
		return nil, fmt.Errorf("akshare FetchStockDaily 失败: %w", err)
	}
	return result.([]provider.DailyPrice), nil
}

// doWithRetry 保留为薄包装以兼容现有测试（TestDoWithRetry_*）。
// 实际请求 + 解析逻辑由 httpclient.DoGetWithBreaker 提供。
func doWithRetry(url string) ([]provider.DailyPrice, error) {
	return httpclient.DoGetWithBreaker(breaker, httpClient, url, parseDailyPrices)
}

// SearchTicker 暂未实现：东方财富搜索接口与 K 线接口协议不同，
// 需单独接入搜索端点，而非复用 FetchStockDaily 的 K 线接口。
func (p *akshareProvider) SearchTicker(query string) ([]provider.TickerInfo, error) {
	return nil, fmt.Errorf("akshare SearchTicker 未实现（需要使用东方财富搜索接口）")
}

// parseCodeAndMarket 从 ticker 中提取股票代码和东方财富市场代码
// 000001_SZ → ("000001", "0")，600519_SH → ("600519", "1")
func parseCodeAndMarket(ticker string) (code, market string) {
	upper := strings.ToUpper(ticker)
	isSH := strings.HasSuffix(upper, "_SH") || strings.HasSuffix(upper, ".SH")

	// 去除后缀
	code = ticker
	if idx := strings.LastIndex(code, "_"); idx > 0 {
		code = code[:idx]
	} else if idx := strings.LastIndex(code, "."); idx > 0 {
		code = code[:idx]
	}

	if isSH {
		return code, "1"
	}
	return code, "0"
}

type eastMoneyResponse struct {
	Data *struct {
		Code   string   `json:"code"`
		Market int      `json:"market"`
		Name   string   `json:"name"`
		Klines []string `json:"klines"`
	} `json:"data"`
}

func parseDailyPrices(body []byte) ([]provider.DailyPrice, error) {
	var raw eastMoneyResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}
	if raw.Data == nil {
		return nil, fmt.Errorf("API 返回空数据")
	}

	var prices []provider.DailyPrice
	for _, kline := range raw.Data.Klines {
		// kline 格式：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
		parts := strings.Split(kline, ",")
		if len(parts) < 11 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date:          parts[0],
			Open:          providerutil.ParseStringFloat(parts[1]),
			Close:         providerutil.ParseStringFloat(parts[2]),
			High:          providerutil.ParseStringFloat(parts[3]),
			Low:           providerutil.ParseStringFloat(parts[4]),
			Volume:        providerutil.ParseStringInt(parts[5]),
			AdjustedClose: providerutil.ParseStringFloat(parts[2]),
		})
	}
	return prices, nil
}
