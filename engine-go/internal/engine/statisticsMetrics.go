package engine

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"math"
	"slices"
	"sort"
	"time"
)

func alignPair(a, b []float64) ([]float64, []float64) {
	if n := min(len(a), len(b)); n >= 2 {
		return a[:n], b[:n]
	}
	return nil, nil
}
func CalcCAGR(startValue, endValue, years float64) float64 {
	if startValue <= 0 || endValue <= 0 || years <= 0 {
		return 0
	}
	return math.Pow(endValue/startValue, 1/years) - 1
}
func CalcMWRR(cashflows []Cashflow) float64 {
	if len(cashflows) == 0 {
		return 0
	}
	npv := func(rate float64) float64 {
		sum := 0.0
		for _, cf := range cashflows {
			sum += cf.Value / math.Pow(1+rate, cf.Time)
		}
		return sum
	}
	return bisect(-0.5, 1.0, 200, func(rate float64) bool { return npv(rate) > 0 })
}
func CalcAnnualizedStdev(dailyReturns []float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	return mathutil.Std(dailyReturns) * math.Sqrt(tradingDaysPerYear)
}
func CalcSharpe(cagr, stdev float64) float64 {
	if stdev == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / stdev
}
func CalcSortino(cagr float64, dailyReturns []float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	dd := CalcDownsideDeviationRaw(dailyReturns, RiskFreeDaily()) * math.Sqrt(tradingDaysPerYear)
	if dd == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / dd
}
func CalcCorrelation(returns1, returns2 []float64) float64 {
	r1, r2 := alignPair(returns1, returns2)
	if r1 == nil {
		return 0
	}
	var1 := mathutil.Covariance(r1, r1)
	var2 := mathutil.Covariance(r2, r2)
	if var1 == 0 || var2 == 0 {
		return 0
	}
	return mathutil.Covariance(r1, r2) / math.Sqrt(var1*var2)
}
func CalcDailyReturns(prices []float64) []float64 { return mathutil.DailyReturns(prices) }
func CalcTotalReturn(startValue, endValue float64) float64 {
	if startValue <= 0 {
		return 0
	}
	return endValue/startValue - 1
}
func MaxValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return slices.Max(values)
}
func MinValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return slices.Min(values)
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
func CalcDownsideDeviation(returns []float64, mar float64, periodsPerYear float64) float64 {
	return CalcDownsideDeviationRaw(returns, mar) * math.Sqrt(periodsPerYear)
}
func CalcDownsideDeviationRaw(returns []float64, mar float64) float64 {
	return mathutil.DownsideDeviation(returns, mar)
}
func CalcAvgGainLoss(returns []float64) (avgGain, avgLoss, gainLossRatio float64) {
	var sumGains, sumLosses float64
	var countGains, countLosses int
	for _, r := range returns {
		switch {
		case r > 0:
			sumGains += r
			countGains++
		case r < 0:
			sumLosses += -r
			countLosses++
		}
	}
	if countGains > 0 {
		avgGain = sumGains / float64(countGains)
	}
	if countLosses > 0 {
		avgLoss = sumLosses / float64(countLosses)
	}
	if avgLoss > 0 {
		gainLossRatio = avgGain / avgLoss
	}
	return
}
func RiskFreeDaily() float64   { return math.Pow(1+riskFreeRate, 1.0/tradingDaysPerYear) - 1 }
func RiskFreeMonthly() float64 { return math.Pow(1+riskFreeRate, 1.0/12.0) - 1 }
func CalcBeta(portfolioReturns, benchmarkReturns []float64) float64 {
	pr, br := alignPair(portfolioReturns, benchmarkReturns)
	if pr == nil {
		return 0
	}
	if varB := mathutil.Covariance(br, br); varB != 0 {
		return mathutil.Covariance(pr, br) / varB
	}
	return 0
}
func CalcAlpha(cagr, beta, benchmarkCagr float64) float64 {
	return cagr - (riskFreeRate + beta*(benchmarkCagr-riskFreeRate))
}
func CalcRSquared(portfolioReturns, benchmarkReturns []float64) float64 {
	corr := CalcCorrelation(portfolioReturns, benchmarkReturns)
	return corr * corr
}
func CalcTrackingError(portfolioReturns, benchmarkReturns []float64) float64 {
	pr, br := alignPair(portfolioReturns, benchmarkReturns)
	if pr == nil {
		return 0
	}
	diffs := make([]float64, len(pr))
	for i := range pr {
		diffs[i] = pr[i] - br[i]
	}
	return mathutil.Std(diffs) * math.Sqrt(tradingDaysPerYear)
}
func CalcInformationRatio(alpha, trackingError float64) float64 {
	if trackingError == 0 {
		return 0
	}
	return alpha / trackingError
}
func CalcUpsideCapture(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcCaptureRatio(portfolioReturns, benchmarkReturns, func(r float64) bool { return r > 0 })
}
func CalcDownsideCapture(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcCaptureRatio(portfolioReturns, benchmarkReturns, func(r float64) bool { return r < 0 })
}
func sortedReturnsPercentile(returns []float64) []float64 {
	if len(returns) < 2 {
		return nil
	}
	sorted := append([]float64(nil), returns...)
	sort.Float64s(sorted)
	return sorted
}
func clampIndex(index, size int) int { return min(max(0, index), size-1) }
func tailMetric(dailyReturns []float64, confidence float64, fn func(sorted []float64, cutoff int) float64) float64 {
	sorted := sortedReturnsPercentile(dailyReturns)
	if sorted == nil || confidence <= 0 || confidence >= 1 {
		return 0
	}
	return fn(sorted, int((1-confidence)*float64(len(sorted))))
}
func CalcVaR(dailyReturns []float64, confidence float64) float64 {
	return tailMetric(dailyReturns, confidence, func(sorted []float64, cutoff int) float64 {
		return -sorted[clampIndex(cutoff, len(sorted))]
	})
}
func CalcCVaR(dailyReturns []float64, confidence float64) float64 {
	return tailMetric(dailyReturns, confidence, func(sorted []float64, cutoff int) float64 {
		if cutoff == 0 {
			return -sorted[0]
		}
		return -mathutil.Mean(sorted[:cutoff])
	})
}
func standardizedMomentSum(returns []float64, power float64) (sum float64, n int, ok bool) {
	n = len(returns)
	if n < int(power) {
		return 0, 0, false
	}
	stdev := mathutil.Std(returns)
	if stdev == 0 {
		return 0, 0, false
	}
	m := mathutil.Mean(returns)
	for _, r := range returns {
		sum += math.Pow((r-m)/stdev, power)
	}
	return sum, n, true
}
func CalcSkewness(returns []float64) float64 {
	sum, n, ok := standardizedMomentSum(returns, 3)
	if !ok {
		return 0
	}
	return (float64(n) / float64((n-1)*(n-2))) * sum
}
func CalcExcessKurtosis(returns []float64) float64 {
	sum, n, ok := standardizedMomentSum(returns, 4)
	if !ok {
		return 0
	}
	return (float64(n*(n+1))/float64((n-1)*(n-2)*(n-3)))*sum - (3.0*float64((n-1)*(n-1)))/float64((n-2)*(n-3))
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
func CalcUpsideCorrelation(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcConditionalCorrelation(portfolioReturns, benchmarkReturns, func(r float64) bool { return r > 0 })
}
func CalcDownsideCorrelation(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcConditionalCorrelation(portfolioReturns, benchmarkReturns, func(r float64) bool { return r < 0 })
}
func CalcUpsideBeta(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcConditionalBeta(portfolioReturns, benchmarkReturns, func(r float64) bool { return r > 0 })
}
func CalcDownsideBeta(portfolioReturns, benchmarkReturns []float64) float64 {
	return calcConditionalBeta(portfolioReturns, benchmarkReturns, func(r float64) bool { return r < 0 })
}
func CalcTreynor(cagr, beta float64) float64 {
	if beta == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / beta
}
func CalcM2(sharpe, benchmarkStdev float64) float64 { return sharpe*benchmarkStdev + riskFreeRate }
func CalcAlphaDaily(dailyReturns, benchDailyReturns []float64, beta float64) float64 {
	if len(dailyReturns) == 0 || len(benchDailyReturns) == 0 {
		return 0
	}
	rfDaily := RiskFreeDaily()
	meanB := mathutil.Mean(benchDailyReturns)
	return mathutil.Mean(dailyReturns) - (rfDaily + beta*(meanB-rfDaily))
}
func filterPairedReturns(portfolioReturns, benchmarkReturns []float64, filter func(float64) bool) (pFilt, bFilt []float64) {
	n := min(len(portfolioReturns), len(benchmarkReturns))
	for i := 0; i < n; i++ {
		if filter(benchmarkReturns[i]) {
			pFilt = append(pFilt, portfolioReturns[i])
			bFilt = append(bFilt, benchmarkReturns[i])
		}
	}
	return pFilt, bFilt
}
func calcConditionalCorrelation(portfolioReturns, benchmarkReturns []float64, filter func(float64) bool) float64 {
	pFilt, bFilt := filterPairedReturns(portfolioReturns, benchmarkReturns, filter)
	if len(pFilt) < 2 {
		return 0
	}
	return CalcCorrelation(pFilt, bFilt)
}
func calcConditionalBeta(portfolioReturns, benchmarkReturns []float64, filter func(float64) bool) float64 {
	pFilt, bFilt := filterPairedReturns(portfolioReturns, benchmarkReturns, filter)
	if len(pFilt) < 2 {
		return 0
	}
	return CalcBeta(pFilt, bFilt)
}

type MaxDrawdownResult struct {
	MaxDrawdown         float64
	MaxDrawdownDuration int
}

func CalcMaxDrawdown(values []float64) MaxDrawdownResult {
	if len(values) < 2 {
		return MaxDrawdownResult{}
	}
	maxDD := 0.0
	maxDDDuration := 0
	engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
		if dd := (peak - values[i]) / peak; dd > maxDD {
			maxDD = dd
			maxDDDuration = i - peakIdx
		}
	})
	return MaxDrawdownResult{MaxDrawdown: maxDD, MaxDrawdownDuration: maxDDDuration}
}
func CalcAvgDrawdown(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	var totalDD float64
	count := 0
	engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
		if peak > 0 {
			if dd := (peak - values[i]) / peak; dd > 0 {
				totalDD += dd
				count++
			}
		}
	})
	if count == 0 {
		return 0
	}
	return totalDD / float64(count)
}
func CalcUlcerIndex(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	var sumSquaredDD float64
	engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
		if peak > 0 {
			dd := (peak - values[i]) / peak
			sumSquaredDD += dd * dd
		}
	})
	return math.Sqrt(sumSquaredDD / float64(len(values)))
}
func CalcCalmar(cagr, maxDrawdown float64) float64 {
	if maxDrawdown == 0 {
		return 0
	}
	return cagr / maxDrawdown
}
func CalcUPI(cagr, ulcerIndex float64) float64 {
	if ulcerIndex == 0 {
		return 0
	}
	return (cagr - riskFreeRate) / ulcerIndex
}
func CalcDrawdownCurve(values []float64, dates []string) []DrawdownPoint {
	if len(values) == 0 {
		return nil
	}
	result := make([]DrawdownPoint, len(values))
	engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
		dd := 0.0
		if peak > 0 {
			dd = (peak - values[i]) / peak
		}
		result[i] = DrawdownPoint{Date: dates[i], Drawdown: dd}
	})
	return result
}
func bisect(low, high float64, iterations int, accept func(mid float64) bool) float64 {
	for i := 0; i < iterations; i++ {
		mid := (low + high) / 2
		if accept(mid) {
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
func CalcPWR(annualReturns []float64) float64 {
	if len(annualReturns) == 0 {
		return 0
	}
	return bisect(0.0, 1.0, 100, func(mid float64) bool { return simulateWithdrawal(annualReturns, mid) })
}
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
func CalcDrawdownRecoveryFactor(totalReturn, maxDrawdown float64) float64 {
	if maxDrawdown <= 0 {
		return 0
	}
	return math.Abs(totalReturn) / maxDrawdown
}
func CalcRollingReturns(values []float64, dates []string, windowMonths int) []RollingReturn {
	windowDays := int(math.Round(float64(windowMonths) * float64(tradingDaysPerYear) / 12.0))
	if windowDays <= 0 || windowDays >= len(values) {
		return nil
	}
	result := make([]RollingReturn, 0, len(values)-windowDays)
	for i := windowDays; i < len(values); i++ {
		if values[i-windowDays] > 0 {
			result = append(result, RollingReturn{Date: dates[i], Return: values[i]/values[i-windowDays] - 1})
		}
	}
	return result
}

type periodBucket struct {
	year, month int
	first, last float64
}

func resampleByPeriod(values []float64, dates []string, monthly bool) []periodBucket {
	type key struct{ y, m int }
	buckets := make(map[key]*periodBucket)
	for i, v := range values {
		y, m := parseYearMonth(dates[i])
		if !monthly {
			m = 0
		}
		k := key{y, m}
		if b, ok := buckets[k]; ok {
			b.last = v
		} else {
			buckets[k] = &periodBucket{y, m, v, v}
		}
	}
	out := make([]periodBucket, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, *b)
	}
	slices.SortFunc(out, func(a, b periodBucket) int {
		if a.year != b.year {
			return a.year - b.year
		}
		return a.month - b.month
	})
	return out
}
func CalcAnnualReturns(values []float64, dates []string) []AnnualReturn {
	buckets := resampleByPeriod(values, dates, false)
	result := make([]AnnualReturn, 0, len(buckets))
	for idx, b := range buckets {
		startValue := values[0]
		if idx > 0 {
			startValue = buckets[idx-1].last
		}
		if startValue > 0 {
			result = append(result, AnnualReturn{Year: b.year, Return: b.last/startValue - 1})
		}
	}
	return result
}
func CalcMonthlyReturns(values []float64, dates []string) []MonthlyReturn {
	buckets := resampleByPeriod(values, dates, true)
	result := make([]MonthlyReturn, 0, len(buckets))
	for _, b := range buckets {
		if b.first > 0 {
			result = append(result, MonthlyReturn{Year: b.year, Month: b.month + 1, Return: b.last/b.first - 1})
		}
	}
	return result
}
func parseYear(dateStr string) int {
	if len(dateStr) < 4 {
		return 0
	}
	t, err := time.Parse("2006", dateStr[:4])
	if err != nil {
		return 0
	}
	return t.Year()
}
func parseYearMonth(dateStr string) (int, int) {
	for _, layout := range []string{"2006-01-02", "2006-01"} {
		if t, err := time.Parse(layout, dateStr); err == nil {
			return t.Year(), int(t.Month()) - 1
		}
	}
	return parseYear(dateStr), 0
}
func CalcSWR(annualReturns []float64, years int, successRate float64) float64 {
	if len(annualReturns) < years || years <= 0 {
		return 0
	}
	return bisect(0.0, 1.0, 100, func(mid float64) bool { return rollingWindowSuccessRate(annualReturns, years, mid) >= successRate })
}
func CalcPWRYears(annualReturns []float64, years int) float64 {
	return CalcSWR(annualReturns, years, 1.0)
}
func rollingWindowSuccessRate(annualReturns []float64, years int, withdrawalRate float64) float64 {
	numWindows := len(annualReturns) - years + 1
	if numWindows <= 0 {
		return 0
	}
	successes := 0
	for start := 0; start < numWindows; start++ {
		if simulateWithdrawal(annualReturns[start:start+years], withdrawalRate) {
			successes++
		}
	}
	return float64(successes) / float64(numWindows)
}
func CalcPWRAllYears(annualReturns []float64) (pwr10y, swr10y, pwr20y, swr20y, pwr30y, swr30y, pwr40y, swr40y float64) {
	out := []*float64{&pwr10y, &swr10y, &pwr20y, &swr20y, &pwr30y, &swr30y, &pwr40y, &swr40y}
	for i, y := range []int{10, 20, 30, 40} {
		if len(annualReturns) >= y {
			*out[i*2] = CalcPWRYears(annualReturns, y)
			*out[i*2+1] = CalcSWR(annualReturns, y, 0.95)
		}
	}
	return
}
