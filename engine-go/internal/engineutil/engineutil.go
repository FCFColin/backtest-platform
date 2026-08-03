package engineutil

import (
	"maps"
	"math"
	"slices"
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
	return slices.Sorted(maps.Keys(dateSet))
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
			if t, err := time.Parse("2006-01-02", dateStr); err == nil {
				dateSet[t] = true
			}
		}
	}
	return slices.SortedFunc(maps.Keys(dateSet), func(a, b time.Time) int { return a.Compare(b) }), nil
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

func WeightedDailyReturns(tickers []string, weights []float64, priceData map[string]map[string]float64, dates []string, requireBoth, normalize bool) []float64 {
	returns := make([]float64, 0, len(dates)-1)
	for i := 1; i < len(dates); i++ {
		weighted := 0.0
		totalWeight := 0.0
		for j, ticker := range tickers {
			prev := priceData[ticker][dates[i-1]]
			curr := priceData[ticker][dates[i]]
			if prev <= 0 || (requireBoth && curr <= 0) {
				continue
			}
			weighted += weights[j] * ((curr - prev) / prev)
			totalWeight += weights[j]
		}
		if normalize && totalWeight > 0 {
			weighted /= totalWeight
		}
		returns = append(returns, weighted)
	}
	return returns
}

/**
 * 组合日收益：对齐共有交易日 → 过滤日期区间 → 按绝对值权重归一化 → 加权日收益。
 * 日期用字符串区间比较（交集语义）；并集语义的调用方自行实现（见 montecarlo）。
 */
func PortfolioDailyReturns(tickers []string, weights []float64, priceData map[string]map[string]float64, startDate, endDate string, requireBoth, normalize bool) []float64 {
	dates := AlignDates(tickers, priceData)
	var common []string
	for _, d := range dates {
		if d >= startDate && d <= endDate {
			common = append(common, d)
		}
	}
	if len(common) < 2 {
		return nil
	}
	total := 0.0
	for _, w := range weights {
		total += math.Abs(w)
	}
	if total == 0 {
		return nil
	}
	norm := make([]float64, len(weights))
	for i, w := range weights {
		norm[i] = math.Abs(w) / total
	}
	return WeightedDailyReturns(tickers, norm, priceData, common, requireBoth, normalize)
}

type PricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

func ToPricePoints(tickerData map[string]float64) []PricePoint {
	var result []PricePoint
	for date, price := range tickerData {
		if price > 0 && !math.IsNaN(price) {
			result = append(result, PricePoint{Date: date, Price: price})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result
}
