package engine

import (
	"math"
	"sort"
)

// CalcBeta 计算贝塔系数。
// beta = cov(portfolio, benchmark) / var(benchmark)
func CalcBeta(portfolioReturns, benchmarkReturns []float64) float64 {
	n := min(len(portfolioReturns), len(benchmarkReturns))
	if n < 2 {
		return 0
	}
	pr := portfolioReturns[:n]
	br := benchmarkReturns[:n]
	meanP := mean(pr)
	meanB := mean(br)

	var cov, varB float64
	for i := 0; i < n; i++ {
		cov += (pr[i] - meanP) * (br[i] - meanB)
		varB += (br[i] - meanB) * (br[i] - meanB)
	}
	if varB == 0 {
		return 0
	}
	return cov / varB
}

// CalcAlpha 计算 Alpha（Jensen's Alpha）。
// alpha = cagr - (riskFreeRate + beta * (benchmarkCagr - riskFreeRate))
func CalcAlpha(cagr, beta, benchmarkCagr float64) float64 {
	return cagr - (riskFreeRate + beta*(benchmarkCagr-riskFreeRate))
}

// CalcRSquared 计算 R²（决定系数）。
// R² = correlation²
func CalcRSquared(portfolioReturns, benchmarkReturns []float64) float64 {
	corr := CalcCorrelation(portfolioReturns, benchmarkReturns)
	return corr * corr
}

// CalcTrackingError 计算跟踪误差。
// TE = std(portfolioReturns - benchmarkReturns) * sqrt(252)
func CalcTrackingError(portfolioReturns, benchmarkReturns []float64) float64 {
	n := min(len(portfolioReturns), len(benchmarkReturns))
	if n < 2 {
		return 0
	}
	diffs := make([]float64, n)
	for i := 0; i < n; i++ {
		diffs[i] = portfolioReturns[i] - benchmarkReturns[i]
	}
	return math.Sqrt(sampleVariance(diffs)) * math.Sqrt(tradingDaysPerYear)
}

// CalcInformationRatio 计算信息比率。
// IR = alpha / trackingError
func CalcInformationRatio(alpha, trackingError float64) float64 {
	if trackingError == 0 {
		return 0
	}
	return alpha / trackingError
}

// CalcUpsideCapture 计算上行捕获比。
func CalcUpsideCapture(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcCaptureRatio(portfolioReturns, benchmarkReturns, func(r float64) bool { return r > 0 })
}

// CalcDownsideCapture 计算下行捕获比。
func CalcDownsideCapture(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcCaptureRatio(portfolioReturns, benchmarkReturns, func(r float64) bool { return r < 0 })
}

// CalcVaR 计算在险价值（历史模拟法）。
// confidence: 如 0.95 表示 95% 置信度，返回正值表示损失。
func CalcVaR(dailyReturns []float64, confidence float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	sorted := make([]float64, len(dailyReturns))
	copy(sorted, dailyReturns)
	sort.Float64s(sorted)
	index := int((1 - confidence) * float64(len(sorted)))
	if index < 0 {
		index = 0
	}
	return -sorted[index]
}

// CalcCVaR 计算条件在险价值（Expected Shortfall）。
func CalcCVaR(dailyReturns []float64, confidence float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	sorted := make([]float64, len(dailyReturns))
	copy(sorted, dailyReturns)
	sort.Float64s(sorted)
	cutoffIndex := int((1 - confidence) * float64(len(sorted)))
	if cutoffIndex == 0 {
		return -sorted[0]
	}
	tailReturns := sorted[:cutoffIndex]
	avg := mean(tailReturns)
	return -avg
}

// CalcSkewness 计算偏度（样本偏度校正公式）。
func CalcSkewness(returns []float64) float64 {
	n := len(returns)
	if n < 3 {
		return 0
	}
	m := mean(returns)
	variance := sampleVariance(returns)
	if variance == 0 {
		return 0
	}
	stdev := math.Sqrt(variance)
	var sumCubed float64
	for _, r := range returns {
		// Intentional: 使用 math.Pow 而非 x*x*x，偏度公式 (r-m)/stdev 的三次方
		// 是标准统计公式，math.Pow 可读性更好，性能差异在此场景可忽略
		sumCubed += math.Pow((r-m)/stdev, 3)
	}
	return (float64(n) / float64((n-1)*(n-2))) * sumCubed
}

// CalcExcessKurtosis 计算超额峰度（Fisher's 校正公式）。
func CalcExcessKurtosis(returns []float64) float64 {
	n := len(returns)
	if n < 4 {
		return 0
	}
	m := mean(returns)
	variance := sampleVariance(returns)
	if variance == 0 {
		return 0
	}
	stdev := math.Sqrt(variance)
	var sumFourth float64
	for _, r := range returns {
		sumFourth += math.Pow((r-m)/stdev, 4)
	}
	return (float64(n*(n+1))/float64((n-1)*(n-2)*(n-3)))*sumFourth -
		(3.0*float64((n-1)*(n-1)))/float64((n-2)*(n-3))
}

// calcCaptureRatio 计算上行/下行捕获比的内部辅助函数。
func calcCaptureRatio(portfolioReturns, benchmarkReturns []float64, filter func(float64) bool) float64 {
	n := min(len(portfolioReturns), len(benchmarkReturns))
	if n < 1 {
		return 0
	}
	var portfolioProduct, benchmarkProduct float64 = 1, 1
	count := 0
	for i := 0; i < n; i++ {
		if filter(benchmarkReturns[i]) {
			portfolioProduct *= (1 + portfolioReturns[i])
			benchmarkProduct *= (1 + benchmarkReturns[i])
			count++
		}
	}
	if count == 0 || benchmarkProduct <= 0 {
		return 0
	}
	portfolioGeoMean := math.Pow(portfolioProduct, 1.0/float64(count)) - 1
	benchmarkGeoMean := math.Pow(benchmarkProduct, 1.0/float64(count)) - 1
	if benchmarkGeoMean == 0 {
		return 0
	}
	return portfolioGeoMean / benchmarkGeoMean
}
