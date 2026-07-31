// Package engineutil 提供回测引擎的共享纯函数工具集（叶子包，不依赖 engine/tactical）。
package engineutil

import (
	"math"
	"sort"
	"time"
)

type RebalanceBands struct {
	Enabled      bool     `json:"enabled"`
	AbsoluteBand *float64 `json:"absoluteBand,omitempty"`
	RelativeBand *float64 `json:"relativeBand,omitempty"`
	UpperBand    *float64 `json:"upperBand,omitempty"`
	LowerBand    *float64 `json:"lowerBand,omitempty"`
}

func ShouldRebalance(
	frequency, prevDate, currDate string,
	threshold float64,
	holdings, weights []float64,
	pv float64,
	bands *RebalanceBands,
) bool {
	prevTime, prevOk := time.Parse("2006-01-02", prevDate)
	currTime, currOk := time.Parse("2006-01-02", currDate)
	datesParsed := prevOk == nil && currOk == nil
	freqTrigger := false
	switch frequency {
	case "daily":
		freqTrigger = true
	case "none":
		return false
	case "weekly":
		if datesParsed {
			_, pw := prevTime.ISOWeek()
			_, cw := currTime.ISOWeek()
			freqTrigger = cw != pw || currTime.Year() != prevTime.Year()
		}
	case "monthly":
		if datesParsed {
			freqTrigger = currTime.Month() != prevTime.Month() || currTime.Year() != prevTime.Year()
		}
	case "quarterly":
		if datesParsed {
			pq := (int(prevTime.Month()) - 1) / 3
			cq := (int(currTime.Month()) - 1) / 3
			freqTrigger = pq != cq || prevTime.Year() != currTime.Year()
		}
	case "annual":
		if datesParsed {
			freqTrigger = prevTime.Year() != currTime.Year()
		}
	case "threshold":
		if threshold > 0 && pv > 0 {
			for j := range holdings {
				if weights[j] == 0 {
					continue
				}
				actual := holdings[j] / pv
				dev := math.Abs(actual-weights[j]) / math.Abs(weights[j]) * 100
				if dev >= threshold {
					return true
				}
			}
		}
		return false
	default:
		return false
	}
	if freqTrigger {
		return true
	}
	if bands != nil {
		for i, w := range weights {
			actual := 0.0
			if pv > 0 {
				actual = holdings[i] / pv
			}
			drift := actual - w
			if bands.AbsoluteBand != nil && math.Abs(drift) > *bands.AbsoluteBand/100 {
				return true
			}
			if bands.RelativeBand != nil && w > 0 && math.Abs(drift)/w > *bands.RelativeBand/100 {
				return true
			}
		}
	}
	return false
}
func NormalizeWeights(weights []float64) []float64 {
	n := len(weights)
	result := make([]float64, n)
	copy(result, weights)
	sum := 0.0
	for _, v := range result {
		sum += v
	}
	if sum <= 0 {
		for i := range result {
			result[i] = 1.0 / float64(n)
		}
		return result
	}
	for i := range result {
		result[i] /= sum
	}
	return result
}

const TradingDaysPerYear = 252.0
const RiskFreeRate = 0.02

func IterDrawdowns(values []float64, fn func(idx, peakIdx int, peak float64)) {
	if len(values) == 0 {
		return
	}
	peak := values[0]
	peakIdx := 0
	for i, v := range values {
		if v > peak {
			peak = v
			peakIdx = i
		}
		fn(i, peakIdx, peak)
	}
}
func AlignDates(tickers []string, priceData map[string]map[string]float64) []string {
	dateSets := make([]map[string]bool, len(tickers))
	for i, t := range tickers {
		ds := make(map[string]bool)
		if pd, ok := priceData[t]; ok {
			for d := range pd {
				ds[d] = true
			}
		}
		dateSets[i] = ds
	}
	if len(dateSets) == 0 || len(dateSets[0]) == 0 {
		return nil
	}
	var commonDates []string
	for d := range dateSets[0] {
		all := true
		for i := 1; i < len(dateSets); i++ {
			if !dateSets[i][d] {
				all = false
				break
			}
		}
		if all {
			commonDates = append(commonDates, d)
		}
	}
	sort.Strings(commonDates)
	return commonDates
}
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
func FilterDates(dates []string, startDate, endDate string) []string {
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
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })
	return dates, nil
}
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
