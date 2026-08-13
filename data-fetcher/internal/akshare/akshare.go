package akshare

import (
	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/providerutil"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

var base = provider.NewBaseProvider("akshare", httpclient.Options{
	RequestDelay: 600 * time.Millisecond,
	UserAgents:   httpclient.DefaultUserAgents,
	ExtraHeaders: map[string]string{
		"Accept":          "application/json,text/plain,*/*",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
	},
})

type akshareProvider struct{ *provider.BaseProvider }

func NewProvider() provider.Provider {
	return &akshareProvider{&base}
}
func (p *akshareProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	code, market := parseCodeAndMarket(ticker)
	secid := fmt.Sprintf("%s.%s", market, code)
	beg := strings.ReplaceAll(startDate, "-", "")
	ed := strings.ReplaceAll(endDate, "-", "")
	url := fmt.Sprintf(
		"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=%s&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=%s&end=%s",
		secid, beg, ed,
	)
	prices, err := doWithRetry(url)
	if err != nil {
		return nil, fmt.Errorf("akshare FetchStockDaily 失败: %w", err)
	}
	return prices, nil
}
func doWithRetry(url string) ([]provider.DailyPrice, error) {
	return httpclient.DoGetWithBreaker(base.Breaker, base.HTTPClient, url, parseDailyPrices)
}
func parseCodeAndMarket(ticker string) (code, market string) {
	upper := strings.ToUpper(ticker)
	isSH := strings.HasSuffix(upper, "_SH") || strings.HasSuffix(upper, ".SH")
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
		parts := strings.Split(kline, ",")
		if len(parts) < 11 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date: parts[0], Open: providerutil.ParseStringFloat(parts[1]),
			Close:         providerutil.ParseStringFloat(parts[2]),
			High:          providerutil.ParseStringFloat(parts[3]),
			Low:           providerutil.ParseStringFloat(parts[4]),
			Volume:        providerutil.ParseStringInt(parts[5]),
			AdjustedClose: providerutil.ParseStringFloat(parts[2])})
	}
	return prices, nil
}
