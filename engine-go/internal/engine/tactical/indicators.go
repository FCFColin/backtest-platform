package tactical

import (
	"engine-go/internal/indicators"
	"math"
)

func evaluateCondition(cond SignalCondition, values []*float64) []bool {
	result := make([]bool, len(values))
	for i, val := range values {
		if val == nil {
			continue
		}
		var prev *float64
		if i > 0 {
			prev = values[i-1]
		}
		crossAbove := *val > cond.Threshold && prev != nil && *prev <= cond.Threshold
		crossBelow := *val < cond.Threshold && prev != nil && *prev >= cond.Threshold
		result[i] = map[string]bool{
			"gt":          *val > cond.Threshold,
			"lt":          *val < cond.Threshold,
			"cross_above": crossAbove,
			"cross_below": crossBelow,
		}[cond.Operator]
	}
	return result
}
func calcMomentum(prices []float64, period int) []float64 {
	result := indicators.NanSeries(len(prices))
	for i := period; i < len(prices); i++ {
		if prices[i-period] > 0 {
			result[i] = (prices[i]/prices[i-period] - 1) * 100
		}
	}
	return result
}
func maPct(prices, ma []float64) []float64 {
	raw := make([]float64, len(prices))
	for i := range prices {
		if !math.IsNaN(ma[i]) && ma[i] != 0 {
			raw[i] = (prices[i] - ma[i]) / ma[i]
		} else {
			raw[i] = math.NaN()
		}
	}
	return raw
}
func computeIndicatorValue(indicator TechnicalIndicator, prices []float64, period int) []*float64 {
	var raw []float64
	switch indicator {
	case IndSMA:
		raw = maPct(prices, indicators.CalcSMA(prices, period))
	case IndEMA:
		raw = maPct(prices, indicators.CalcEMA(prices, period))
	case IndRSI:
		raw = indicators.CalcRSI(prices, period)
	case IndMACD:
		raw = indicators.CalcMACDHist(prices)
	case IndBollinger:
		raw = indicators.CalcBollingerPctB(prices, period)
	case IndMomentum:
		raw = calcMomentum(prices, period)
	default:
		raw = indicators.NanSeries(len(prices))
	}
	result := make([]*float64, len(raw))
	for i, v := range raw {
		if !math.IsNaN(v) {
			vc := v
			result[i] = &vc
		}
	}
	return result
}
