// Package dates 提供交易日解析和过滤共享函数。
//
// 企业理由（ADR-008）：从 engine/backtest.go、montecarlo/montecarlo.go、
// analysis/analysis.go 中提取共享函数，消除 parseTradingDates / filterByDateRange /
// extractPrices 的三重复实现。所有修改在统一位置进行，避免各副本不同步。
package dates

import (
	"log"
	"math"
	"sort"
	"time"
)

// ParseTradingDates 从价格数据中提取所有交易日并排序。
func ParseTradingDates(priceData map[string]map[string]float64) ([]time.Time, error) {
	dateSet := make(map[time.Time]bool)
	for _, tickerData := range priceData {
		for dateStr := range tickerData {
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				log.Printf("警告：跳过无法解析的日期 %q: %v", dateStr, err)
				continue
			}
			dateSet[t] = true
		}
	}

	dates := make([]time.Time, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Slice(dates, func(i, j int) bool {
		return dates[i].Before(dates[j])
	})

	return dates, nil
}

// FilterByDateRange 按日期范围过滤交易日。
func FilterByDateRange(dates []time.Time, startDate, endDate string) []time.Time {
	var start, end time.Time
	if startDate != "" {
		start, _ = time.Parse("2006-01-02", startDate)
	}
	if endDate != "" {
		end, _ = time.Parse("2006-01-02", endDate)
	}

	filtered := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if !start.IsZero() && d.Before(start) {
			continue
		}
		if !end.IsZero() && d.After(end) {
			continue
		}
		filtered = append(filtered, d)
	}
	return filtered
}

// ExtractPrices 提取指定资产在交易日序列上的价格。
func ExtractPrices(priceData map[string]map[string]float64, ticker string, dates []time.Time) []float64 {
	tickerData, ok := priceData[ticker]
	if !ok {
		return make([]float64, len(dates))
	}
	prices := make([]float64, len(dates))
	for i, d := range dates {
		dateStr := d.Format("2006-01-02")
		if p, exists := tickerData[dateStr]; exists {
			prices[i] = p
		}
	}
	return prices
}

// GetSortedDates 从价格数据中提取所有日期字符串并排序（供 analysis 包使用）。
func GetSortedDates(priceData map[string]map[string]float64, tickers []string) []string {
	dateSet := make(map[string]struct{})
	for _, ticker := range tickers {
		if td, ok := priceData[ticker]; ok {
			for date := range td {
				dateSet[date] = struct{}{}
			}
		}
	}
	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	return dates
}

// FilterDateStrings 过滤日期字符串范围。
func FilterDateStrings(dates []string, startDate, endDate string) []string {
	if startDate == "" && endDate == "" {
		return dates
	}
	result := make([]string, 0, len(dates))
	for _, d := range dates {
		if startDate != "" && d < startDate {
			continue
		}
		if endDate != "" && d > endDate {
			continue
		}
		result = append(result, d)
	}
	return result
}

// ExtractPricesFromMap 从 priceData 中提取指定 ticker 在给定日期序列上的价格。
func ExtractPricesFromMap(priceData map[string]map[string]float64, ticker string, dates []string) ([]float64, []string) {
	td, ok := priceData[ticker]
	if !ok {
		return nil, nil
	}
	prices := make([]float64, 0, len(dates))
	priceDates := make([]string, 0, len(dates))
	for _, d := range dates {
		if p, exists := td[d]; exists && p > 0 && !math.IsNaN(p) && !math.IsInf(p, 0) {
			prices = append(prices, p)
			priceDates = append(priceDates, d)
		}
	}
	return prices, priceDates
}
