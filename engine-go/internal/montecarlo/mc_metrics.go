package montecarlo

import (
	"math"
	"slices"

	"engine-go/internal/mathutil"
)

// computePerPathMetrics 计算每条路径的指标
//
// 企业理由：每条路径的独立指标允许深度分析模拟结果的分布特征，
// 如 CAGR 分布、最大回撤分布等，比仅看百分位路径提供更丰富的信息。
func computePerPathMetrics(paths [][]float64, startingValue float64, numYears int) []PathMetrics {
	if len(paths) == 0 {
		return nil
	}

	metrics := make([]PathMetrics, len(paths))
	years := float64(numYears)

	for i, path := range paths {
		metrics[i] = calcPathMetrics(path, startingValue, years)
	}

	return metrics
}

// calcPathMetrics 计算单条模拟路径的指标
func calcPathMetrics(path []float64, startingValue float64, years float64) PathMetrics {
	finalValue := path[len(path)-1]

	cagr := 0.0
	if startingValue > 0 && years > 0 && finalValue > 0 {
		cagr = math.Pow(finalValue/startingValue, 1.0/years) - 1
	}

	pathLen := len(path)
	dailyRets := make([]float64, pathLen-1)
	for j := 1; j < pathLen; j++ {
		if path[j-1] > 0 {
			dailyRets[j-1] = (path[j] - path[j-1]) / path[j-1]
		}
	}

	maxDD := 0.0
	peak := path[0]
	for _, v := range path {
		if v > peak {
			peak = v
		}
		if peak > 0 {
			dd := (peak - v) / peak
			if dd > maxDD {
				maxDD = dd
			}
		}
	}

	vol := 0.0
	if len(dailyRets) > 1 {
		vol = mathutil.Std(dailyRets) * math.Sqrt(float64(mcTradingDays))
	}

	sharpe := 0.0
	if vol > 0 {
		sharpe = (cagr - mcRiskFreeRate) / vol
	}

	sortino := mcSortino(dailyRets, cagr)

	return PathMetrics{
		FinalValue:  finalValue,
		CAGR:        cagr,
		MaxDrawdown: maxDD,
		Volatility:  vol,
		Sharpe:      sharpe,
		Sortino:     sortino,
	}
}

// computeMCStatistics 计算蒙特卡洛统计摘要
//
// 企业理由：统计摘要提供模拟结果的快速概览，中位数和均值
// 反映集中趋势，成功率是退休规划的关键决策指标。
func computeMCStatistics(paths [][]float64, threshold float64, startingValue float64) MCStatistics {
	if len(paths) == 0 {
		return MCStatistics{}
	}

	finalValues := make([]float64, len(paths))
	target := startingValue * threshold
	successCount := 0

	for i, path := range paths {
		finalValues[i] = path[len(path)-1]
		if finalValues[i] >= target {
			successCount++
		}
	}

	slices.Sort(finalValues)

	n := len(finalValues)
	medianIdx := n / 2
	medianVal := finalValues[medianIdx]
	if n%2 == 0 && medianIdx > 0 {
		medianVal = (finalValues[medianIdx-1] + finalValues[medianIdx]) / 2
	}

	meanVal := 0.0
	for _, v := range finalValues {
		meanVal += v
	}
	meanVal /= float64(n)

	return MCStatistics{
		MedianFinalValue: medianVal,
		MeanFinalValue:   meanVal,
		SuccessRate:      float64(successCount) / float64(n),
	}
}

// mcSortino 计算索提诺比率
//
// 企业理由：索提诺比率只惩罚下行波动，比夏普比率更适合
// 评估不对称收益分布的策略，对蒙特卡洛模拟的厚尾路径尤其重要。
// 注意：本函数使用线性日化无风险利率（mcRiskFreeRate/mcTradingDays），
// 与 engine.CalcSortino 的复利日化公式不同，故未转调 engine 包。
func mcSortino(dailyRets []float64, cagr float64) float64 {
	if len(dailyRets) == 0 {
		return 0
	}
	dailyRF := mcRiskFreeRate / float64(mcTradingDays)
	sumSq := 0.0
	for _, r := range dailyRets {
		excess := r - dailyRF
		if excess < 0 {
			sumSq += excess * excess
		}
	}
	downsideDev := math.Sqrt(sumSq/float64(len(dailyRets))) * math.Sqrt(float64(mcTradingDays))
	if downsideDev == 0 {
		return 0
	}
	return (cagr - mcRiskFreeRate) / downsideDev
}
