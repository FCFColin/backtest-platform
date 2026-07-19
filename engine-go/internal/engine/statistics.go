package engine

import (
	"math"

	"engine-go/internal/engineutil"
)

// 统计核心计算函数。回撤相关函数在 statistics_drawdown.go，
// 风险指标在 statistics_risk.go，收益序列在 statistics_returns.go。

const (
	tradingDaysPerYear = engineutil.TradingDaysPerYear
	riskFreeRate       = engineutil.RiskFreeRate
)

// CalcCAGR 计算复合年化增长率。
// CAGR = (endValue / startValue) ^ (1 / years) - 1
func CalcCAGR(startValue, endValue, years float64) float64 {
	if startValue <= 0 || endValue <= 0 || years <= 0 {
		return 0
	}
	return math.Pow(endValue/startValue, 1/years) - 1
}

// CalcMWRR 计算货币加权收益率（内部收益率），使用二分法近似。
// cashflows: [{value, time}] value 为正表示投入，为负表示取出，time 为年数。
func CalcMWRR(cashflows []struct {
	Value float64
	Time  float64
}) float64 {
	if len(cashflows) == 0 {
		return 0
	}
	low, high := -0.5, 1.0
	for i := 0; i < 200; i++ {
		mid := (low + high) / 2
		npv := 0.0
		for _, cf := range cashflows {
			npv += cf.Value / math.Pow(1+mid, cf.Time)
		}
		if math.Abs(npv) < 1e-8 {
			return mid
		}
		if npv > 0 {
			low = mid
		} else {
			high = mid
		}
	}
	return (low + high) / 2
}

// CalcAnnualizedStdev 计算年化波动率（标准差）。
// stdev = std(dailyReturns) * sqrt(252)
func CalcAnnualizedStdev(dailyReturns []float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	return math.Sqrt(sampleVariance(dailyReturns)) * math.Sqrt(tradingDaysPerYear)
}

// CalcSharpe 计算夏普比率。
// sharpe = (cagr - riskFreeRate) / stdev
func CalcSharpe(cagr, stdev float64) float64 {
	if stdev == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / stdev
}

// CalcSortino 计算 Sortino 比率。
// sortino = (cagr - riskFreeRate) / downsideDeviation
func CalcSortino(cagr float64, dailyReturns []float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	dailyRiskFree := math.Pow(1+riskFreeRate, 1.0/tradingDaysPerYear) - 1
	var downsideVariance float64
	for _, r := range dailyReturns {
		if r < dailyRiskFree {
			downsideVariance += (r - dailyRiskFree) * (r - dailyRiskFree)
		}
	}
	downsideVariance /= float64(len(dailyReturns))
	downsideDeviation := math.Sqrt(downsideVariance) * math.Sqrt(tradingDaysPerYear)
	if downsideDeviation == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / downsideDeviation
}

// CalcCorrelation 计算皮尔逊相关系数。
func CalcCorrelation(returns1, returns2 []float64) float64 {
	n := min(len(returns1), len(returns2))
	if n < 2 {
		return 0
	}
	r1 := returns1[:n]
	r2 := returns2[:n]
	mean1 := mean(r1)
	mean2 := mean(r2)

	var cov, var1, var2 float64
	for i := 0; i < n; i++ {
		d1 := r1[i] - mean1
		d2 := r2[i] - mean2
		cov += d1 * d2
		var1 += d1 * d1
		var2 += d2 * d2
	}
	if var1 == 0 || var2 == 0 {
		return 0
	}
	return (cov / float64(n-1)) / math.Sqrt((var1/float64(n-1))*(var2/float64(n-1)))
}

// CalcDailyReturns 计算日收益率序列。
func CalcDailyReturns(prices []float64) []float64 {
	return dailyReturnsFromPrices(prices)
}

// CalcTotalReturn 计算总收益率。
func CalcTotalReturn(startValue, endValue float64) float64 {
	if startValue <= 0 {
		return 0
	}
	return endValue/startValue - 1
}

// CalcBestYear 计算最佳年度收益。
func CalcBestYear(annualReturns []float64) float64 {
	return maxValue(annualReturns)
}

// CalcWorstYear 计算最差年度收益。
func CalcWorstYear(annualReturns []float64) float64 {
	return minValue(annualReturns)
}

// CalcBestMonth 计算最佳月度收益。
func CalcBestMonth(monthlyReturns []float64) float64 {
	return maxValue(monthlyReturns)
}

// CalcWorstMonth 计算最差月度收益。
func CalcWorstMonth(monthlyReturns []float64) float64 {
	return minValue(monthlyReturns)
}

// ---- 辅助函数 ----

func maxValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	m := values[0]
	for _, v := range values[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

func minValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	m := values[0]
	for _, v := range values[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

func ratioPositive(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	count := 0
	for _, v := range values {
		if v > 0 {
			count++
		}
	}
	return float64(count) / float64(len(values))
}

func mean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func sampleVariance(values []float64) float64 {
	n := len(values)
	if n < 2 {
		return 0
	}
	m := mean(values)
	var sum float64
	for _, v := range values {
		d := v - m
		sum += d * d
	}
	return sum / float64(n-1)
}
