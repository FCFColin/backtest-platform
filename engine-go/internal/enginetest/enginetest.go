// Package enginetest 提供跨包测试共享的合成行情数据构造工具。
package enginetest

import (
	"time"
)

// PriceData 生成 tickers×days 的合成价格数据（跳过周末，价格按 growth 复利增长）。
func PriceData(tickers []string, bases []float64, start time.Time, days int, growth float64) map[string]map[string]float64 {
	priceData := make(map[string]map[string]float64, len(tickers))
	for idx, ticker := range tickers {
		prices := make(map[string]float64, days)
		base := bases[idx]
		for i := 0; i < days; i++ {
			date := start.AddDate(0, 0, i)
			if wd := date.Weekday(); wd == time.Saturday || wd == time.Sunday {
				continue
			}
			prices[date.Format("2006-01-02")] = base
			base *= 1 + growth
		}
		priceData[ticker] = prices
	}
	return priceData
}

// ThreeTickerData 生成 VTI/BND/GLD 三资产合成数据（基准价 100/50/80）。
func ThreeTickerData(start time.Time, days int, growth float64) map[string]map[string]float64 {
	return PriceData([]string{"VTI", "BND", "GLD"}, []float64{100, 50, 80}, start, days, growth)
}

// Dates 生成从 startDate 起 n 个连续日期字符串。
func Dates(startDate string, n int) []string {
	t, _ := time.Parse("2006-01-02", startDate)
	dates := make([]string, n)
	for i := 0; i < n; i++ {
		dates[i] = t.AddDate(0, 0, i).Format("2006-01-02")
	}
	return dates
}

// PriceMap 生成 date→price 映射（日期从 startDate 起递增）。
func PriceMap(startDate string, prices []float64) map[string]float64 {
	t, _ := time.Parse("2006-01-02", startDate)
	m := make(map[string]float64, len(prices))
	for i, p := range prices {
		m[t.AddDate(0, 0, i).Format("2006-01-02")] = p
	}
	return m
}

// SeriesPriceData 用给定日期与价格序列构造单 ticker 行情。
func SeriesPriceData(ticker string, dates []string, prices []float64) map[string]map[string]float64 {
	pd := map[string]map[string]float64{ticker: {}}
	for i, d := range dates {
		pd[ticker][d] = prices[i]
	}
	return pd
}

// LinearPriceData 生成单 ticker 线性增长价格数据（价格 = startPrice*(1+dailyGrowth*i)）。
func LinearPriceData(ticker, startDate string, days int, startPrice, dailyGrowth float64) map[string]map[string]float64 {
	t, _ := time.Parse("2006-01-02", startDate)
	prices := make(map[string]float64, days)
	for i := 0; i < days; i++ {
		prices[t.AddDate(0, 0, i).Format("2006-01-02")] = startPrice * (1 + dailyGrowth*float64(i))
	}
	return map[string]map[string]float64{ticker: prices}
}
