package tactical

import (
	"math"

	"engine-go/internal/indicators"
)

var nan = math.NaN()

// ===== 战术指标计算 =====
//
// SMA/EMA/RSI/MACD histogram/Bollinger %B 已下沉至 indicators 包统一实现
// （spec Wave 1 Task 1.2：消除与 signal 包的重复实现）。本文件仅保留
// tactical 专有的 calcMomentum 与 computeIndicatorValue 适配层。

// calcMomentum 计算动量指标：(prices[i] / prices[i-period] - 1) * 100。
// 不足 period 的位置或除零时填 NaN。
func calcMomentum(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
	for i := period; i < len(prices); i++ {
		if prices[i-period] > 0 {
			result[i] = (prices[i]/prices[i-period] - 1) * 100
		}
	}
	return result
}

// maPct 计算价格相对均线的偏离百分比。
func maPct(prices, ma []float64) []float64 {
	raw := make([]float64, len(prices))
	for i := range prices {
		if !math.IsNaN(ma[i]) && ma[i] != 0 {
			raw[i] = (prices[i] - ma[i]) / ma[i]
		} else {
			raw[i] = nan
		}
	}
	return raw
}

// computeIndicatorValue 计算指标值序列。
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
		raw = make([]float64, len(prices))
		for i := range raw {
			raw[i] = nan
		}
	}
	result := make([]*float64, len(raw))
	for i, v := range raw {
		if math.IsNaN(v) {
			result[i] = nil
		} else {
			vCopy := v
			result[i] = &vCopy
		}
	}
	return result
}
