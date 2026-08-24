package engine

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"gonum.org/v1/gonum/stat"
	"math"
)

const (
	tradingDaysPerYear = engineutil.TradingDaysPerYear
	riskFreeRate       = engineutil.RiskFreeRate
)

type StatisticsRequest struct {
	Values                []float64  `json:"values"`
	Dates                 []string   `json:"dates"`
	StartingValue         float64    `json:"startingValue"`
	DailyReturns          []float64  `json:"dailyReturns"`
	AnnualReturnValues    []float64  `json:"annualReturnValues"`
	MonthlyReturnValues   []float64  `json:"monthlyReturnValues"`
	MwrrCashflows         []Cashflow `json:"mwrrCashflows"`
	BenchmarkDailyReturns []float64  `json:"benchmarkDailyReturns"`
	BenchmarkCagr         *float64   `json:"benchmarkCagr"`
}
type Cashflow struct {
	Value float64 `json:"value"`
	Time  float64 `json:"time"`
}

func calcRiskLevels(returns []float64, calc func([]float64, float64) float64) VaRLevels {
	return VaRLevels{One: calc(returns, 0.99), Five: calc(returns, 0.95), Ten: calc(returns, 0.90)}
}
func vaRByFrequency(returns [3][]float64, calc func([]float64, float64) float64) VaRByFrequency {
	return VaRByFrequency{Daily: calcRiskLevels(returns[0], calc), Monthly: calcRiskLevels(returns[1], calc), Annual: calcRiskLevels(returns[2], calc)}
}
func skewByFrequency(returns [3][]float64, calc func([]float64) float64) SkewnessByFrequency {
	return SkewnessByFrequency{Daily: calc(returns[0]), Monthly: calc(returns[1]), Annual: calc(returns[2])}
}
func CalculateStatisticsFromRequest(req StatisticsRequest) Statistics {
	if len(req.Values) < 2 {
		return Statistics{}
	}
	freqs := [3][]float64{req.DailyReturns, req.MonthlyReturnValues, req.AnnualReturnValues}
	finalValue := req.Values[len(req.Values)-1]
	years := float64(len(req.Dates)) / float64(tradingDaysPerYear)
	// 组合清零（finalValue<=0）时 CAGR 不可计算，置 0 而非 -1 哨兵，避免泄漏进 Sharpe/Calmar 等派生指标
	cagr := 0.0
	if finalValue > 0 {
		cagr = CalcCAGR(req.StartingValue, finalValue, years)
	}
	stdevDailyRaw := 0.0
	if len(req.DailyReturns) >= 2 {
		stdevDailyRaw = stat.StdDev(req.DailyReturns, nil)
	}
	stdevDaily := stdevDailyRaw * math.Sqrt(tradingDaysPerYear)
	rfDaily := RiskFreeDaily()
	dd := CalcMaxDrawdown(req.Values)
	ulcerIdx := CalcUlcerIndex(req.Values)
	sortino := CalcSortino(cagr, req.DailyReturns)
	sharpe := CalcSharpe(cagr, stdevDaily)
	mwrr := -1.0
	if finalValue > 0 {
		mwrr = CalcMWRR(append(append([]Cashflow{}, req.MwrrCashflows...), Cashflow{Value: finalValue, Time: years}))
	}
	var bm benchmarkMetrics
	if len(req.BenchmarkDailyReturns) >= 2 && req.BenchmarkCagr != nil {
		bm = computeBenchmarkMetrics(req.DailyReturns, req.BenchmarkDailyReturns, cagr, *req.BenchmarkCagr)
	}
	totalReturn := CalcTotalReturn(req.StartingValue, finalValue)
	pctPosDays := ratioPositive(req.DailyReturns)
	pctPosMonths := ratioPositive(req.MonthlyReturnValues)
	pctPosYears := ratioPositive(req.AnnualReturnValues)
	avgAnnual := stat.Mean(req.AnnualReturnValues, nil)
	avgMonthly := stat.Mean(req.MonthlyReturnValues, nil)
	avgDaily := stat.Mean(req.DailyReturns, nil)
	maxDailyRet := MaxValue(req.DailyReturns)
	minDailyRet := MinValue(req.DailyReturns)
	maxAnnualRet := MaxValue(req.AnnualReturnValues)
	minAnnualRet := MinValue(req.AnnualReturnValues)
	pwr := CalcPWR(req.AnnualReturnValues)
	pwrAll := CalcPWRAllYears(req.AnnualReturnValues)
	swr := 0.0
	for _, y := range []struct {
		threshold int
		val       float64
	}{{40, pwrAll.SWR40Y}, {30, pwrAll.SWR30Y}, {20, pwrAll.SWR20Y}, {10, pwrAll.SWR10Y}} {
		if len(req.AnnualReturnValues) >= y.threshold {
			swr = y.val
			break
		}
	}
	avgDailyGain, avgDailyLoss, gainLossRatioDaily := CalcAvgGainLoss(req.DailyReturns)
	avgMonthlyGain, avgMonthlyLoss, gainLossRatioMonthly := CalcAvgGainLoss(req.MonthlyReturnValues)
	avgAnnualGain, avgAnnualLoss, gainLossRatioAnnual := CalcAvgGainLoss(req.AnnualReturnValues)
	return Statistics{
		CAGR: cagr, MWRR: mwrr, Stdev: stdevDaily, Sharpe: sharpe, Sortino: sortino, MaxDrawdown: dd.MaxDrawdown, MaxDrawdownDuration: dd.MaxDrawdownDuration,
		BestYear: maxAnnualRet, WorstYear: minAnnualRet, AvgYear: avgAnnual, TotalReturn: totalReturn,
		MaxMonthlyReturn: MaxValue(req.MonthlyReturnValues), MinMonthlyReturn: MinValue(req.MonthlyReturnValues), AvgDrawdown: CalcAvgDrawdown(req.Values), UlcerIndex: ulcerIdx,
		Calmar: CalcCalmar(cagr, dd.MaxDrawdown), UlcerPerformanceIndex: CalcUPI(cagr, ulcerIdx), Beta: bm.Beta, Alpha: bm.Alpha, RSquared: bm.RSquared,
		TrackingError: bm.TrackingError, InformationRatio: bm.InformationRatio, UpsideCapture: bm.UpsideCapture, DownsideCapture: bm.DownsideCapture,
		MaxDailyReturn: maxDailyRet, MinDailyReturn: minDailyRet, PWR: pwr,
		Var: vaRByFrequency(freqs, CalcVaR), Cvar: vaRByFrequency(freqs, CalcCVaR),
		Skewness: skewByFrequency(freqs, CalcSkewness), ExcessKurtosis: skewByFrequency(freqs, CalcExcessKurtosis),
		WinRate: SkewnessByFrequency{Daily: pctPosDays, Monthly: pctPosMonths, Annual: pctPosYears}, PctPositiveDays: pctPosDays,
		AvgAnnualReturn: avgAnnual, AvgMonthlyReturn: avgMonthly, AvgDailyReturn: avgDaily,
		StdevAnnual: stat.StdDev(req.AnnualReturnValues, nil), StdevMonthly: stat.StdDev(req.MonthlyReturnValues, nil) * math.Sqrt(12), StdevMonthlyRaw: stat.StdDev(req.MonthlyReturnValues, nil),
		StdevDaily: stdevDaily, StdevDailyRaw: stdevDailyRaw,
		DownsideDeviation: mathutil.DownsideDeviation(req.DailyReturns, rfDaily) * math.Sqrt(tradingDaysPerYear), DownsideDeviationDailyRaw: mathutil.DownsideDeviation(req.DailyReturns, rfDaily),
		DownsideDeviationMonthly: mathutil.DownsideDeviation(req.MonthlyReturnValues, RiskFreeMonthly()) * math.Sqrt(12), DownsideDeviationMonthlyRaw: mathutil.DownsideDeviation(req.MonthlyReturnValues, RiskFreeMonthly()),
		DownsideDeviationAnnual: mathutil.DownsideDeviation(req.AnnualReturnValues, riskFreeRate), DrawdownRecoveryFactor: CalcDrawdownRecoveryFactor(totalReturn, dd.MaxDrawdown),
		M2: bm.M2, Treynor: bm.Treynor, BenchmarkCorrelation: bm.BenchmarkCorrelation, UpsideCorrelation: bm.UpsideCorrelation, DownsideCorrelation: bm.DownsideCorrelation,
		UpsideBeta: bm.UpsideBeta, DownsideBeta: bm.DownsideBeta, AlphaDaily: bm.AlphaDaily, AlphaAnnualized: bm.Alpha,
		CaptureSpread: bm.CaptureSpread,
		ActiveReturn:  bm.ActiveReturn, PctPositiveMonths: pctPosMonths, PctPositiveYears: pctPosYears, MaxAnnualReturn: maxAnnualRet, MinAnnualReturn: minAnnualRet,
		AvgDailyGain: avgDailyGain, AvgDailyLoss: avgDailyLoss, GainLossRatioDaily: gainLossRatioDaily,
		AvgMonthlyGain: avgMonthlyGain, AvgMonthlyLoss: avgMonthlyLoss, GainLossRatioMonthly: gainLossRatioMonthly,
		AvgAnnualGain: avgAnnualGain, AvgAnnualLoss: avgAnnualLoss, GainLossRatioAnnual: gainLossRatioAnnual,
		SWR: swr, SWR10Y: pwrAll.SWR10Y, PWR10Y: pwrAll.PWR10Y, SWR20Y: pwrAll.SWR20Y, PWR20Y: pwrAll.PWR20Y, SWR30Y: pwrAll.SWR30Y, PWR30Y: pwrAll.PWR30Y, SWR40Y: pwrAll.SWR40Y, PWR40Y: pwrAll.PWR40Y,
	}
}
