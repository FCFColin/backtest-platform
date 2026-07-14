package engine

import (
	"math"
)

// MaxDrawdownResult 包含最大回撤及持续时间。
type MaxDrawdownResult struct {
	MaxDrawdown         float64
	MaxDrawdownDuration int
}

// CalcMaxDrawdown 计算最大回撤及最大回撤持续时间（天数）。
func CalcMaxDrawdown(values []float64) MaxDrawdownResult {
	if len(values) < 2 {
		return MaxDrawdownResult{}
	}
	peak := values[0]
	maxDD := 0.0
	maxDDDuration := 0
	currentPeakIdx := 0

	for i := 1; i < len(values); i++ {
		if values[i] > peak {
			peak = values[i]
			currentPeakIdx = i
		}
		dd := (peak - values[i]) / peak
		if dd > maxDD {
			maxDD = dd
			maxDDDuration = i - currentPeakIdx
		}
	}
	return MaxDrawdownResult{MaxDrawdown: maxDD, MaxDrawdownDuration: maxDDDuration}
}

// CalcAvgDrawdown 计算平均回撤深度。
func CalcAvgDrawdown(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	peak := values[0]
	var totalDD float64
	count := 0
	for i := 1; i < len(values); i++ {
		if values[i] > peak {
			peak = values[i]
		}
		if peak > 0 {
			dd := (peak - values[i]) / peak
			if dd > 0 {
				totalDD += dd
				count++
			}
		}
	}
	if count == 0 {
		return 0
	}
	return totalDD / float64(count)
}

// CalcUlcerIndex 计算溃疡指数。
// UI = sqrt(sum(((peak - value) / peak)^2) / n)
func CalcUlcerIndex(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	peak := values[0]
	var sumSquaredDD float64
	for _, v := range values {
		if v > peak {
			peak = v
		}
		if peak > 0 {
			dd := (peak - v) / peak
			sumSquaredDD += dd * dd
		}
	}
	return math.Sqrt(sumSquaredDD / float64(len(values)))
}

// CalcCalmar 计算卡玛比率。
// calmar = cagr / maxDrawdown
func CalcCalmar(cagr, maxDrawdown float64) float64 {
	if maxDrawdown == 0 {
		return 0
	}
	return cagr / maxDrawdown
}

// CalcUPI 计算溃疡绩效指数。
// upi = (cagr - riskFreeRate) / ulcerIndex
func CalcUPI(cagr, ulcerIndex float64) float64 {
	if ulcerIndex == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / ulcerIndex
}

// CalcDrawdownCurve 计算回撤曲线。
func CalcDrawdownCurve(values []float64, dates []string) []DrawdownPoint {
	result := make([]DrawdownPoint, len(values))
	peak := values[0]
	for i, v := range values {
		if v > peak {
			peak = v
		}
		dd := 0.0
		if peak > 0 {
			dd = (peak - v) / peak
		}
		result[i] = DrawdownPoint{Date: dates[i], Drawdown: dd}
	}
	return result
}

// CalcPWR 计算永续提款率（二分查找）。
func CalcPWR(annualReturns []float64) float64 {
	if len(annualReturns) == 0 {
		return 0
	}
	low, high := 0.0, 1.0
	for i := 0; i < 100; i++ {
		mid := (low + high) / 2
		if simulateWithdrawal(annualReturns, mid) {
			low = mid
		} else {
			high = mid
		}
		if high-low < 1e-8 {
			break
		}
	}
	return low
}

// simulateWithdrawal 模拟给定提款率下组合是否不会耗尽。
func simulateWithdrawal(annualReturns []float64, withdrawalRate float64) bool {
	portfolio := 1.0
	for _, ret := range annualReturns {
		portfolio = portfolio*(1+ret) - withdrawalRate
		if portfolio <= 0 {
			return false
		}
	}
	return true
}
