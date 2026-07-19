package engineutil

import (
	"sort"
	"time"
)

// ParseTradingDates 从价格数据中提取所有交易日并去重排序。
// 保留 error 返回值以保持与历史 engine.parseTradingDates 签名兼容（当前始终返回 nil）。
// 收口自 engine/backtest.go 与 montecarlo/montecarlo.go 的重复实现。
func ParseTradingDates(priceData map[string]map[string]float64) ([]time.Time, error) {
	dateSet := make(map[time.Time]bool)
	for _, tickerData := range priceData {
		for dateStr := range tickerData {
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
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
// startDate/endDate 为空或解析失败时跳过对应边界检查（保持历史行为）。
// 收口自 engine/backtest.go 与 montecarlo/montecarlo.go 的重复实现。
func FilterByDateRange(dates []time.Time, startDate, endDate string) []time.Time {
	var start, end time.Time
	if startDate != "" {
		start, _ = time.Parse("2006-01-02", startDate) //nolint:errcheck // 企业理由：解析失败时 start 为零值，IsZero() 检查会跳过该过滤条件
	}
	if endDate != "" {
		end, _ = time.Parse("2006-01-02", endDate) //nolint:errcheck // 企业理由：解析失败时 end 为零值，IsZero() 检查会跳过该过滤条件
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
// 缺失的价格以 0 填充（与历史 engine.extractPrices / montecarlo.extractPrices 行为一致）。
// 收口自 engine/backtest.go 与 montecarlo/montecarlo.go 的重复实现。
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