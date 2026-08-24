package engine

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"gonum.org/v1/gonum/stat"
	"math"
	"slices"
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
	hasNegative := slices.ContainsFunc(cashflows, func(cf Cashflow) bool { return cf.Value < 0 })
	hasPositive := slices.ContainsFunc(cashflows, func(cf Cashflow) bool { return cf.Value > 0 })
	// IRR 需同时存在投入（负）与回收（正）现金流，单边现金流无定义（防 bisect 收敛到区间端点）
	if !hasNegative || !hasPositive {
		return 0
	}
	npv := func(rate float64) float64 {
		sum := 0.0
		for _, cf := range cashflows {
			sum += cf.Value / math.Pow(1+rate, cf.Time)
		}
		return sum
	}
	return bisect(-0.99, 100, 200, func(rate float64) bool { return npv(rate) > 0 })
}
func CalcAnnualizedStdev(dailyReturns []float64) float64 {
	return stat.StdDev(dailyReturns, nil) * math.Sqrt(tradingDaysPerYear)
}
func safeRatio(num, denom float64) float64 {
	if denom == 0 {
		return 0
	}
	return num / denom
}
func CalcSharpe(cagr, stdev float64) float64 { return safeRatio(cagr-riskFreeRate, stdev) }
func CalcSortino(cagr float64, dailyReturns []float64) float64 {
	if len(dailyReturns) < 2 {
		return 0
	}
	return safeRatio(cagr-riskFreeRate, mathutil.DownsideDeviation(dailyReturns, RiskFreeDaily())*math.Sqrt(tradingDaysPerYear))
}
func CalcCorrelation(returns1, returns2 []float64) float64 {
	r1, r2 := alignPair(returns1, returns2)
	v1, v2 := stat.Covariance(r1, r1, nil), stat.Covariance(r2, r2, nil)
	if v1 == 0 || v2 == 0 {
		return 0
	}
	return stat.Covariance(r1, r2, nil) / math.Sqrt(v1*v2)
}
func CalcTotalReturn(startValue, endValue float64) float64 {
	if startValue <= 0 {
		return 0
	}
	return endValue/startValue - 1
}
func extrema(values []float64, pick func([]float64) float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return pick(values)
}
func MaxValue(values []float64) float64 { return extrema(values, slices.Max[[]float64]) }
func MinValue(values []float64) float64 { return extrema(values, slices.Min[[]float64]) }
func ratioPositive(values []float64) float64 {
	count := 0
	for _, v := range values {
		if v > 0 {
			count++
		}
	}
	return safeRatio(float64(count), float64(len(values)))
}
func CalcAvgGainLoss(returns []float64) (avgGain, avgLoss, gainLossRatio float64) {
	sumGains, sumLosses, countGains, countLosses := 0.0, 0.0, 0, 0
	for _, r := range returns {
		if r > 0 {
			sumGains += r
			countGains++
		} else if r < 0 {
			sumLosses += -r
			countLosses++
		}
	}
	avgGain, avgLoss = safeRatio(sumGains, float64(countGains)), safeRatio(sumLosses, float64(countLosses))
	gainLossRatio = safeRatio(avgGain, avgLoss)
	return
}
func RiskFreeDaily() float64   { return math.Pow(1+riskFreeRate, 1.0/tradingDaysPerYear) - 1 }
func RiskFreeMonthly() float64 { return math.Pow(1+riskFreeRate, 1.0/12.0) - 1 }
func CalcBeta(portfolioReturns, benchmarkReturns []float64) float64 {
	pr, br := alignPair(portfolioReturns, benchmarkReturns)
	return safeRatio(stat.Covariance(pr, br, nil), stat.Covariance(br, br, nil))
}
func CalcAlpha(cagr, beta, benchmarkCagr float64) float64 {
	return cagr - (riskFreeRate + beta*(benchmarkCagr-riskFreeRate))
}

// CalcDiversificationRatio 加权资产日波动 / 组合日波动；数据不足或组合零波动返回 0（不可计算）。
func CalcDiversificationRatio(weights []float64, assetDailyReturns [][]float64, portfolioDailyReturns []float64) float64 {
	portStd, weightedStd := stat.StdDev(portfolioDailyReturns, nil), 0.0
	if len(weights) == 0 || len(weights) != len(assetDailyReturns) || len(portfolioDailyReturns) < 2 || portStd == 0 {
		return 0
	}
	for i := range weights {
		weightedStd += weights[i] * stat.StdDev(assetDailyReturns[i], nil)
	}
	return weightedStd / portStd
}
func CalcRSquared(pr, br []float64) float64 { c := CalcCorrelation(pr, br); return c * c }
func CalcTrackingError(portfolioReturns, benchmarkReturns []float64) float64 {
	pr, br := alignPair(portfolioReturns, benchmarkReturns)
	diffs := make([]float64, len(pr))
	for i := range pr {
		diffs[i] = pr[i] - br[i]
	}
	return stat.StdDev(diffs, nil) * math.Sqrt(tradingDaysPerYear)
}
func CalcInformationRatio(alpha, trackingError float64) float64 {
	return safeRatio(alpha, trackingError)
}
func CalcCaptureRatio(pr, br []float64, upside bool) float64 {
	pp, bp, count := 1.0, 1.0, 0
	for i := 0; i < min(len(pr), len(br)); i++ {
		if upside == (br[i] > 0) {
			pp *= 1 + pr[i]
			bp *= 1 + br[i]
			count++
		}
	}
	geoMean := func(p float64) float64 { return math.Pow(p, 1.0/float64(count)) - 1 }
	if count == 0 || bp <= 0 || geoMean(bp) == 0 {
		return 0
	}
	return geoMean(pp) / geoMean(bp)
}
func tailMetric(dailyReturns []float64, confidence float64, fn func(sorted []float64, cutoff int) float64) float64 {
	if len(dailyReturns) < 2 || confidence <= 0 || confidence >= 1 {
		return 0
	}
	sorted := append([]float64(nil), dailyReturns...)
	slices.Sort(sorted)
	return fn(sorted, int((1-confidence)*float64(len(sorted))))
}
func CalcVaR(dailyReturns []float64, confidence float64) float64 {
	return tailMetric(dailyReturns, confidence, func(sorted []float64, cutoff int) float64 { return -sorted[min(max(0, cutoff), len(sorted)-1)] })
}
func CalcCVaR(dailyReturns []float64, confidence float64) float64 {
	return tailMetric(dailyReturns, confidence, func(sorted []float64, cutoff int) float64 { return -stat.Mean(sorted[:max(cutoff, 1)], nil) })
}
func standardizedMomentSum(returns []float64, power float64) (sum float64, n int, ok bool) {
	n, stdev := len(returns), stat.StdDev(returns, nil)
	if n < int(power) || stdev == 0 {
		return 0, 0, false
	}
	m := stat.Mean(returns, nil)
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
func CalcTreynor(cagr, beta float64) float64        { return safeRatio(cagr-riskFreeRate, beta) }
func CalcM2(sharpe, benchmarkStdev float64) float64 { return sharpe*benchmarkStdev + riskFreeRate }
func calcAlphaDaily(dailyReturns, benchDailyReturns []float64, beta float64) float64 {
	if len(dailyReturns) == 0 || len(benchDailyReturns) == 0 {
		return 0
	}
	return stat.Mean(dailyReturns, nil) - (RiskFreeDaily() + beta*(stat.Mean(benchDailyReturns, nil)-RiskFreeDaily()))
}
func calcFiltered(pr, br []float64, upside bool, calc func([]float64, []float64) float64) float64 {
	n := min(len(pr), len(br))
	pFilt, bFilt := make([]float64, 0, n), make([]float64, 0, n)
	for i := 0; i < n; i++ {
		if upside == (br[i] > 0) {
			pFilt = append(pFilt, pr[i])
			bFilt = append(bFilt, br[i])
		}
	}
	if len(pFilt) < 2 {
		return 0
	}
	return calc(pFilt, bFilt)
}

type MaxDrawdownResult struct {
	MaxDrawdown         float64
	MaxDrawdownDuration int
}

func reduceDrawdowns[T any](values []float64, init T, fn func(acc T, dd float64, i, peakIdx int) T) T {
	acc := init
	engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
		if len(values) >= 2 && peak > 0 {
			acc = fn(acc, (peak-values[i])/peak, i, peakIdx)
		}
	})
	return acc
}
func CalcMaxDrawdown(values []float64) MaxDrawdownResult {
	return reduceDrawdowns(values, MaxDrawdownResult{}, func(acc MaxDrawdownResult, dd float64, i, peakIdx int) MaxDrawdownResult {
		if dd > acc.MaxDrawdown {
			return MaxDrawdownResult{dd, i - peakIdx}
		}
		return acc
	})
}

// CalcAvgDrawdown 返回处于回撤状态期间的日均水下深度（非各回撤事件的均值）。
func CalcAvgDrawdown(values []float64) float64 {
	totals := reduceDrawdowns(values, [2]float64{}, func(a [2]float64, dd float64, _, _ int) [2]float64 {
		if dd > 0 {
			return [2]float64{a[0] + dd, a[1] + 1}
		}
		return a
	})
	return safeRatio(totals[0], totals[1])
}
func CalcUlcerIndex(values []float64) float64 {
	sumSq := reduceDrawdowns(values, 0.0, func(acc, dd float64, _, _ int) float64 { return acc + dd*dd })
	return math.Sqrt(safeRatio(sumSq, float64(len(values))))
}
func CalcCalmar(cagr, maxDrawdown float64) float64 { return safeRatio(cagr, maxDrawdown) }
func CalcUPI(cagr, ulcerIndex float64) float64     { return safeRatio(cagr-riskFreeRate, ulcerIndex) }
func CalcDrawdownCurve(values []float64, dates []string) []DrawdownPoint {
	if len(values) == 0 {
		return nil
	}
	result := make([]DrawdownPoint, len(values))
	engineutil.IterDrawdowns(values, func(i, _ int, peak float64) {
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
func CalcPWR(annualReturns []float64) float64 { return CalcSWR(annualReturns, len(annualReturns), 1.0) }
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
	buckets := map[int]*periodBucket{}
	for i, v := range values {
		y, m := parseYearMonth(dates[i])
		if !monthly {
			m = 0
		}
		if buckets[y*12+m] == nil {
			buckets[y*12+m] = &periodBucket{y, m, v, v}
		}
		buckets[y*12+m].last = v
	}
	out := make([]periodBucket, 0, len(buckets))
	for _, b := range buckets {
		out = append(out, *b)
	}
	slices.SortFunc(out, func(a, b periodBucket) int { return a.year*12 + a.month - (b.year*12 + b.month) })
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
func parseYearMonth(dateStr string) (int, int) {
	for _, layout := range [...]string{"2006-01-02", "2006-01"} {
		if t, err := time.Parse(layout, dateStr); err == nil {
			return t.Year(), int(t.Month()) - 1
		}
	}
	if t, err := time.Parse("2006", dateStr[:min(4, len(dateStr))]); err == nil {
		return t.Year(), 0
	}
	return 0, 0
}
func CalcSWR(annualReturns []float64, years int, successRate float64) float64 {
	if len(annualReturns) < years || years <= 0 {
		return 0
	}
	return bisect(0.0, 1.0, 100, func(mid float64) bool { return rollingWindowSuccessRate(annualReturns, years, mid) >= successRate })
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

type PWRAllYears struct{ PWR10Y, SWR10Y, PWR20Y, SWR20Y, PWR30Y, SWR30Y, PWR40Y, SWR40Y float64 }

func CalcPWRAllYears(annualReturns []float64) PWRAllYears {
	var r PWRAllYears
	fields := []*float64{&r.PWR10Y, &r.SWR10Y, &r.PWR20Y, &r.SWR20Y, &r.PWR30Y, &r.SWR30Y, &r.PWR40Y, &r.SWR40Y}
	for i, years := range [...]int{10, 20, 30, 40} {
		if len(annualReturns) >= years {
			*fields[2*i], *fields[2*i+1] = CalcSWR(annualReturns, years, 1.0), CalcSWR(annualReturns, years, 0.95)
		}
	}
	return r
}

type benchmarkMetrics struct {
	Beta, Alpha, RSquared, TrackingError, InformationRatio              float64
	UpsideCapture, DownsideCapture, CaptureSpread, BenchmarkCorrelation float64
	UpsideCorrelation, DownsideCorrelation, UpsideBeta, DownsideBeta    float64
	Treynor, M2, AlphaDaily, ActiveReturn                               float64
}

func computeBenchmarkMetrics(portfolioReturns, benchmarkReturns []float64, cagr, benchmarkCagr float64) benchmarkMetrics {
	pr, br := portfolioReturns, benchmarkReturns
	beta, trackErr := CalcBeta(pr, br), CalcTrackingError(pr, br)
	alpha, upside, downside := CalcAlpha(cagr, beta, benchmarkCagr), CalcCaptureRatio(pr, br, true), CalcCaptureRatio(pr, br, false)
	benchStd := CalcAnnualizedStdev(br)
	return benchmarkMetrics{
		Beta: beta, Alpha: alpha, TrackingError: trackErr, InformationRatio: CalcInformationRatio(alpha, trackErr),
		RSquared:      CalcRSquared(pr, br),
		UpsideCapture: upside, DownsideCapture: downside, CaptureSpread: upside - downside,
		BenchmarkCorrelation: CalcCorrelation(pr, br),
		UpsideCorrelation:    calcFiltered(pr, br, true, CalcCorrelation),
		DownsideCorrelation:  calcFiltered(pr, br, false, CalcCorrelation),
		UpsideBeta:           calcFiltered(pr, br, true, CalcBeta),
		DownsideBeta:         calcFiltered(pr, br, false, CalcBeta),
		Treynor:              CalcTreynor(cagr, beta),
		M2:                   CalcM2(CalcSharpe(cagr, benchStd), benchStd),
		AlphaDaily:           calcAlphaDaily(pr, br, beta),
		ActiveReturn:         cagr - benchmarkCagr,
	}
}
