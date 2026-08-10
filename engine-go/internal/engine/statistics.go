package engine

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"math"
)

const (
	tradingDaysPerYear = engineutil.TradingDaysPerYear
	riskFreeRate       = engineutil.RiskFreeRate
)

type StatisticsRequest struct {
	Values                 []float64  `json:"values"`
	Dates                  []string   `json:"dates"`
	StartingValue          float64    `json:"startingValue"`
	DailyReturns           []float64  `json:"dailyReturns"`
	AnnualReturnValues     []float64  `json:"annualReturnValues"`
	MonthlyReturnValues    []float64  `json:"monthlyReturnValues"`
	MwrrCashflows          []Cashflow `json:"mwrrCashflows"`
	BenchmarkDailyReturns  []float64  `json:"benchmarkDailyReturns"`
	BenchmarkAnnualReturns []float64  `json:"benchmarkAnnualReturns"`
	WeightedAssetVol       float64    `json:"weightedAssetVol"`
	BenchmarkCagr          *float64   `json:"benchmarkCagr"`
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
	cagr := -1.0
	if finalValue > 0 {
		cagr = CalcCAGR(req.StartingValue, finalValue, years)
	}
	stdevDailyRaw := mathutil.Std(req.DailyReturns)
	stdevDaily := stdevDailyRaw * math.Sqrt(tradingDaysPerYear)
	diversificationRatio := 0.0
	if stdevDailyRaw > 0 {
		diversificationRatio = req.WeightedAssetVol / stdevDailyRaw
	}
	dd := CalcMaxDrawdown(req.Values)
	ulcerIdx := CalcUlcerIndex(req.Values)
	sortino := CalcSortino(cagr, req.DailyReturns)
	sharpe := CalcSharpe(cagr, stdevDaily)
	mwrr := -1.0
	if finalValue > 0 {
		mwrr = CalcMWRR(append(append([]Cashflow{}, req.MwrrCashflows...), Cashflow{Value: finalValue, Time: years}))
	}
	beta, alpha, rSq, trackingErr, infoRatio, upsideDaily, downsideDaily := 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
	upsideAnnual, downsideAnnual := 0.0, 0.0
	benchmarkCorrelation, upsideCorr, downsideCorr := 0.0, 0.0, 0.0
	if len(req.BenchmarkDailyReturns) >= 2 && req.BenchmarkCagr != nil {
		bench := req.BenchmarkDailyReturns
		beta = CalcBeta(req.DailyReturns, bench)
		alpha = CalcAlpha(cagr, beta, *req.BenchmarkCagr)
		rSq = CalcRSquared(req.DailyReturns, bench)
		trackingErr = CalcTrackingError(req.DailyReturns, bench)
		infoRatio = CalcInformationRatio(alpha, trackingErr)
		upsideDaily = CalcCaptureRatio(req.DailyReturns, bench, true)
		downsideDaily = CalcCaptureRatio(req.DailyReturns, bench, false)
		benchmarkCorrelation = CalcCorrelation(req.DailyReturns, bench)
		upsideCorr = CalcConditionalCorr(req.DailyReturns, bench, true)
		downsideCorr = CalcConditionalCorr(req.DailyReturns, bench, false)
		upsideAnnual, downsideAnnual = CalcCaptureRatio(req.AnnualReturnValues, req.BenchmarkAnnualReturns, true), CalcCaptureRatio(req.AnnualReturnValues, req.BenchmarkAnnualReturns, false)
	}
	totalReturn := CalcTotalReturn(req.StartingValue, finalValue)
	pctPosDays := ratioPositive(req.DailyReturns)
	pctPosMonths := ratioPositive(req.MonthlyReturnValues)
	pctPosYears := ratioPositive(req.AnnualReturnValues)
	avgAnnual := mathutil.Mean(req.AnnualReturnValues)
	avgMonthly := mathutil.Mean(req.MonthlyReturnValues)
	avgDaily := mathutil.Mean(req.DailyReturns)
	maxDailyRet := MaxValue(req.DailyReturns)
	minDailyRet := MinValue(req.DailyReturns)
	maxAnnualRet := MaxValue(req.AnnualReturnValues)
	minAnnualRet := MinValue(req.AnnualReturnValues)
	pwr := CalcPWR(req.AnnualReturnValues)
	pwr10y, swr10y, pwr20y, swr20y, pwr30y, swr30y, pwr40y, swr40y := CalcPWRAllYears(req.AnnualReturnValues)
	swr := 0.0
	for _, y := range []struct {
		threshold int
		val       float64
	}{{40, swr40y}, {30, swr30y}, {20, swr20y}, {10, swr10y}} {
		if len(req.AnnualReturnValues) >= y.threshold {
			swr = y.val
			break
		}
	}
	return Statistics{
		CAGR: cagr, MWRR: mwrr, Stdev: stdevDaily, Sharpe: sharpe, Sortino: sortino, MaxDrawdown: dd.MaxDrawdown, MaxDrawdownDuration: dd.MaxDrawdownDuration,
		BestYear: maxAnnualRet, WorstYear: minAnnualRet, TotalReturn: totalReturn,
		MaxMonthlyReturn: MaxValue(req.MonthlyReturnValues), MinMonthlyReturn: MinValue(req.MonthlyReturnValues), AvgDrawdown: CalcAvgDrawdown(req.Values), UlcerIndex: ulcerIdx,
		Calmar: CalcCalmar(cagr, dd.MaxDrawdown), UlcerPerformanceIndex: CalcUPI(cagr, ulcerIdx), Beta: beta, Alpha: alpha, RSquared: rSq,
		TrackingError: trackingErr, InformationRatio: infoRatio, UpsideCapture: upsideDaily, DownsideCapture: downsideDaily,
		MaxDailyReturn: maxDailyRet, MinDailyReturn: minDailyRet, PWR: pwr,
		Var: vaRByFrequency(freqs, CalcVaR), Cvar: vaRByFrequency(freqs, CalcCVaR),
		Skewness: skewByFrequency(freqs, CalcSkewness), ExcessKurtosis: skewByFrequency(freqs, CalcExcessKurtosis),
		WinRate: SkewnessByFrequency{Daily: pctPosDays, Monthly: pctPosMonths, Annual: pctPosYears}, PctPositiveDays: pctPosDays,
		AvgAnnualReturn: avgAnnual, AvgMonthlyReturn: avgMonthly, AvgDailyReturn: avgDaily,
		StdevDaily:             stdevDaily,
		DrawdownRecoveryFactor: CalcDrawdownRecoveryFactor(totalReturn, dd.MaxDrawdown),
		DiversificationRatio:   diversificationRatio, BenchmarkCorrelation: benchmarkCorrelation, UpsideCorrelation: upsideCorr, DownsideCorrelation: downsideCorr,
		UpsideCaptureAnnual: upsideAnnual, DownsideCaptureAnnual: downsideAnnual,
		PctPositiveMonths: pctPosMonths, MaxAnnualReturn: maxAnnualRet, MinAnnualReturn: minAnnualRet,
		SWR: swr, SWR10Y: swr10y, PWR10Y: pwr10y, SWR20Y: swr20y, PWR20Y: pwr20y, SWR30Y: swr30y, PWR30Y: pwr30y, SWR40Y: swr40y, PWR40Y: pwr40y,
	}
}
