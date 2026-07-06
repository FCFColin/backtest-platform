package engine

import (
	"math"
	"sort"
)

// 企业理由：所有统计计算函数集中于此，与 TypeScript api/engine/statistics.ts 保持算法一致。
// 复用此包可避免 analysis/backtest 各自实现导致指标口径分歧。

const (
	tradingDaysPerYear = 252
	riskFreeRate       = 0.02
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
	yearFirstValue := make(map[int]float64)
	for i, v := range values {
		year := parseYear(dates[i])
		yearLastValue[year] = v
		if _, ok := yearFirstValue[year]; !ok {
			yearFirstValue[year] = v
		}
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

// parseYear 从 "2024-01-02" 格式解析年份。
func parseYear(dateStr string) int {
	if len(dateStr) < 4 {
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
