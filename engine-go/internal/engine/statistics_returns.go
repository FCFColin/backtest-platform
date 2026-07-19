package engine

import (
	"math"
	"sort"
)

// CalcRollingReturns 计算滚动窗口收益率。
func CalcRollingReturns(values []float64, dates []string, windowMonths int) []RollingReturn {
	windowDays := int(math.Round(float64(windowMonths) * float64(tradingDaysPerYear) / 12.0))
	if windowDays <= 0 || windowDays >= len(values) {
		return nil
	}
	result := make([]RollingReturn, 0, len(values)-windowDays)
	for i := windowDays; i < len(values); i++ {
		if values[i-windowDays] > 0 {
			rr := values[i]/values[i-windowDays] - 1
			result = append(result, RollingReturn{Date: dates[i], Return: rr})
		}
	}
	return result
}

// CalcAnnualReturns 计算年度收益率。
func CalcAnnualReturns(values []float64, dates []string) []AnnualReturn {
	// 收集每年最后交易日的值
	yearLastValue := make(map[int]float64)
	for i, v := range values {
		year := parseYear(dates[i])
		yearLastValue[year] = v
	}

	years := make([]int, 0, len(yearLastValue))
	for y := range yearLastValue {
		years = append(years, y)
	}
	sort.Ints(years)

	result := make([]AnnualReturn, 0, len(years))
	for idx, y := range years {
		endValue := yearLastValue[y]
		var startValue float64
		if idx == 0 {
			startValue = values[0]
		} else {
			startValue = yearLastValue[years[idx-1]]
		}
		if startValue > 0 {
			result = append(result, AnnualReturn{Year: y, Return: endValue/startValue - 1})
		}
	}
	return result
}

// CalcMonthlyReturns 计算月度收益率。
func CalcMonthlyReturns(values []float64, dates []string) []MonthlyReturn {
	type monthKey struct {
		year  int
		month int
	}
	monthMap := make(map[monthKey]struct {
		first float64
		last  float64
	})
	for i, v := range values {
		y, m := parseYearMonth(dates[i])
		key := monthKey{year: y, month: m}
		if _, ok := monthMap[key]; !ok {
			monthMap[key] = struct {
				first float64
				last  float64
			}{first: v, last: v}
		} else {
			entry := monthMap[key]
			entry.last = v
			monthMap[key] = entry
		}
	}

	result := make([]MonthlyReturn, 0, len(monthMap))
	for key, vals := range monthMap {
		if vals.first > 0 {
			result = append(result, MonthlyReturn{
				Year:   key.year,
				Month:  key.month + 1, // 企业理由：前端期望 1-12，Go time.Month 为 1-12
				Return: vals.last/vals.first - 1,
			})
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Year != result[j].Year {
			return result[i].Year < result[j].Year
		}
		return result[i].Month < result[j].Month
	})
	return result
}

// parseYear 从 "2024-01-02" 格式解析年份。
func parseYear(dateStr string) int {
	if len(dateStr) < 4 || len(dateStr) > 10 {
		return 0
	}
	y := 0
	for _, c := range dateStr[:4] {
		y = y*10 + int(c-'0')
	}
	return y
}

// parseYearMonth 从 "2024-01-02" 格式解析年份和月份（0-based）。
func parseYearMonth(dateStr string) (int, int) {
	y := parseYear(dateStr)
	m := 0
	if len(dateStr) >= 7 {
		// "2024-01" -> 0
		m = int(dateStr[5]-'0')*10 + int(dateStr[6]-'0') - 1
	}
	return y, m
}
