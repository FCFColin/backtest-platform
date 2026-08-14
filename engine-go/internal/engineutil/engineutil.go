package engineutil

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"sort"
	"strings"
	"time"
)

// InputError 标记客户端入参导致的失败（映射为 4xx，不触发熔断器，ADR-008）。
type InputError struct{ msg string }

func (e *InputError) Error() string { return e.msg }

func NewInputError(format string, args ...any) error {
	return &InputError{msg: fmt.Sprintf(format, args...)}
}

type RebalanceBands struct {
	Enabled      bool     `json:"enabled"`
	AbsoluteBand *float64 `json:"absoluteBand,omitempty"`
	RelativeBand *float64 `json:"relativeBand,omitempty"`
}

var periodCrossing = map[string]func(prev, curr time.Time) bool{
	"daily": func(_, _ time.Time) bool { return true },
	"weekly": func(p, c time.Time) bool {
		_, pw := p.ISOWeek()
		_, cw := c.ISOWeek()
		return cw != pw || c.Year() != p.Year()
	},
	"monthly":   func(p, c time.Time) bool { return c.Month() != p.Month() || c.Year() != p.Year() },
	"quarterly": func(p, c time.Time) bool { return (int(p.Month())-1)/3 != (int(c.Month())-1)/3 || p.Year() != c.Year() },
	"annual":    func(p, c time.Time) bool { return p.Year() != c.Year() },
}

func ShouldRebalance(
	frequency, prevDate, currDate string,
	threshold float64,
	holdings, weights []float64,
	pv float64,
	bands *RebalanceBands,
) bool {
	if frequency == "none" {
		return false
	}
	if frequency == "daily" {
		return true
	}
	if frequency == "threshold" {
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
	}
	crossing, ok := periodCrossing[frequency]
	if !ok {
		return false
	}
	prevTime, prevErr := time.Parse("2006-01-02", prevDate)
	currTime, currErr := time.Parse("2006-01-02", currDate)
	if prevErr == nil && currErr == nil && crossing(prevTime, currTime) {
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

func DefaultStartingValue(v float64) float64 {
	if v <= 0 {
		return 10000
	}
	return v
}

// BoundedInt 限制整型参数：v<=0 时回退 def，超过 max 时截断（防恶意超大输入 OOM/CPU DoS）。
func BoundedInt(v, def, max int) int {
	if v <= 0 {
		return def
	}
	return min(v, max)
}

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
	if len(tickers) == 0 {
		return nil
	}
	common := map[string]bool{}
	for d := range priceData[tickers[0]] {
		common[d] = true
	}
	if len(common) == 0 {
		return nil
	}
	for _, t := range tickers[1:] {
		for d := range common {
			if _, ok := priceData[t][d]; !ok {
				delete(common, d)
			}
		}
	}
	return slices.Sorted(maps.Keys(common))
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
	return FilterByRange(dates, startDate, endDate, strings.Compare)
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
	return FilterByRange(dates, startDate, endDate, func(d time.Time, bound string) int {
		bt, err := time.Parse("2006-01-02", bound)
		if err != nil {
			return 0 // 无法解析的边界不过滤（与旧实现一致）
		}
		return d.Compare(bt)
	})
}
func FilterByRange[T any](dates []T, startDate, endDate string, compare func(d T, bound string) int) []T {
	if startDate == "" && endDate == "" {
		return dates
	}
	result := make([]T, 0, len(dates))
	for _, d := range dates {
		if startDate != "" && compare(d, startDate) < 0 {
			continue
		}
		if endDate != "" && compare(d, endDate) > 0 {
			continue
		}
		result = append(result, d)
	}
	return result
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

func PortfolioDailyReturns(tickers []string, weights []float64, priceData map[string]map[string]float64, startDate, endDate string, requireBoth, normalize bool) []float64 {
	dates := FilterDates(AlignDates(tickers, priceData), startDate, endDate)
	if len(dates) < 2 {
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
	return WeightedDailyReturns(tickers, norm, priceData, dates, requireBoth, normalize)
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
