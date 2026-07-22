package engine

import "math"

// StatisticsRequest 是 /api/engine/statistics 的请求体。
// tactical/signal 等通过 Go 函数直接调用 engine.CalculateStatisticsFromRequest，
// 无需经 HTTP；本结构体同时供 /api/engine/statistics HTTP 端点使用。
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

// Cashflow 表示 MWRR 计算的现金流腿。
type Cashflow struct {
	Value float64 `json:"value"`
	Time  float64 `json:"time"`
}

// CalculateStatisticsFromRequest 从请求体计算完整 Statistics 对象。
func CalculateStatisticsFromRequest(req StatisticsRequest) Statistics {
	if len(req.Values) < 2 {
		return Statistics{}
	}

	finalValue := req.Values[len(req.Values)-1]
	years := float64(len(req.Dates)) / float64(tradingDaysPerYear)

	cagr := -1.0
	if finalValue > 0 {
		cagr = CalcCAGR(req.StartingValue, finalValue, years)
	}

	// 各频率波动率计算
	stdevDailyRaw := sampleStdev(req.DailyReturns)
	stdevDaily := stdevDailyRaw * math.Sqrt(tradingDaysPerYear)
	stdevMonthlyRaw := sampleStdev(req.MonthlyReturnValues)
	stdevMonthly := stdevMonthlyRaw * math.Sqrt(12)
	stdevAnnual := sampleStdev(req.AnnualReturnValues)

	// 各频率平均收益
	avgDailyReturn := mean(req.DailyReturns)
	avgMonthlyReturn := mean(req.MonthlyReturnValues)
	avgAnnualReturn := mean(req.AnnualReturnValues)

	dd := CalcMaxDrawdown(req.Values)
	avgDD := CalcAvgDrawdown(req.Values)
	ulcerIdx := CalcUlcerIndex(req.Values)
	calmar := CalcCalmar(cagr, dd.MaxDrawdown)
	upi := CalcUPI(cagr, ulcerIdx)
	sortino := CalcSortino(cagr, req.DailyReturns)
	sharpe := CalcSharpe(cagr, stdevDaily)

	// 下行偏差各频率
	rfDaily := RiskFreeDaily()
	rfMonthly := RiskFreeMonthly()
	downsideDeviationDailyRaw := CalcDownsideDeviationRaw(req.DailyReturns, rfDaily)
	downsideDeviation := CalcDownsideDeviation(req.DailyReturns, rfDaily, tradingDaysPerYear)
	downsideDeviationMonthlyRaw := CalcDownsideDeviationRaw(req.MonthlyReturnValues, rfMonthly)
	downsideDeviationMonthly := CalcDownsideDeviation(req.MonthlyReturnValues, rfMonthly, 12)
	downsideDeviationAnnual := CalcDownsideDeviationRaw(req.AnnualReturnValues, riskFreeRate)

	// MWRR
	type cf struct {
		Value float64
		Time  float64
	}
	mwrrCfs := make([]struct {
		Value float64
		Time  float64
	}, len(req.MwrrCashflows))
	for i, c := range req.MwrrCashflows {
		mwrrCfs[i].Value = c.Value
		mwrrCfs[i].Time = c.Time
	}
	mwrrCfs = append(mwrrCfs, struct {
		Value float64
		Time  float64
	}{Value: finalValue, Time: years})
	mwrr := -1.0
	if finalValue > 0 {
		mwrr = CalcMWRR(mwrrCfs)
	}

	// 基准相关指标
	beta, alpha, rSq, trackingErr, infoRatio := 0.0, 0.0, 0.0, 0.0, 0.0
	upsideDaily, downsideDaily := 0.0, 0.0
	upsideAnnual, downsideAnnual := 0.0, 0.0
	benchmarkCorrelation, upsideCorr, downsideCorr := 0.0, 0.0, 0.0
	upsideBetaVal, downsideBetaVal := 0.0, 0.0
	treynor, m2, alphaDaily := 0.0, 0.0, 0.0
	benchmarkStdev := 0.0
	activeReturn := 0.0
	hasBenchmark := len(req.BenchmarkDailyReturns) >= 2 && req.BenchmarkCagr != nil
	if hasBenchmark {
		bench := req.BenchmarkDailyReturns
		beta = CalcBeta(req.DailyReturns, bench)
		alpha = CalcAlpha(cagr, beta, *req.BenchmarkCagr)
		rSq = CalcRSquared(req.DailyReturns, bench)
		trackingErr = CalcTrackingError(req.DailyReturns, bench)
		infoRatio = CalcInformationRatio(alpha, trackingErr)
		upsideDaily = CalcUpsideCapture(req.DailyReturns, bench)
		downsideDaily = CalcDownsideCapture(req.DailyReturns, bench)
		benchmarkCorrelation = CalcCorrelation(req.DailyReturns, bench)
		upsideCorr = CalcUpsideCorrelation(req.DailyReturns, bench)
		downsideCorr = CalcDownsideCorrelation(req.DailyReturns, bench)
		upsideBetaVal = CalcUpsideBeta(req.DailyReturns, bench)
		downsideBetaVal = CalcDownsideBeta(req.DailyReturns, bench)
		treynor = CalcTreynor(cagr, beta)
		benchmarkStdev = CalcAnnualizedStdev(bench)
		m2 = CalcM2(sharpe, benchmarkStdev)
		alphaDaily = CalcAlphaDaily(req.DailyReturns, bench, beta)
		activeReturn = cagr - *req.BenchmarkCagr

		if len(req.AnnualReturnValues) > 0 {
			// 注：此处需要年频基准收益才能计算年频捕获比，暂用0或简化处理
			// 由于StatisticsRequest中未提供年频基准收益，年频捕获比留空或通过日频聚合
			// 为保持一致性，暂时不计算年频捕获比（需要额外数据）
		}
	}

	totalReturn := CalcTotalReturn(req.StartingValue, finalValue)
	pctPositiveDays := ratioPositive(req.DailyReturns)
	pctPositiveMonths := ratioPositive(req.MonthlyReturnValues)
	pctPositiveYears := ratioPositive(req.AnnualReturnValues)
	maxDailyRet := MaxValue(req.DailyReturns)
	minDailyRet := MinValue(req.DailyReturns)
	maxAnnualReturn := MaxValue(req.AnnualReturnValues)
	minAnnualReturn := MinValue(req.AnnualReturnValues)

	// 回撤恢复因子
	drawdownRecoveryFactor := CalcDrawdownRecoveryFactor(totalReturn, dd.MaxDrawdown)

	// 平均盈亏各频率
	avgDailyGain, avgDailyLoss, gainLossRatioDaily := CalcAvgGainLoss(req.DailyReturns)
	avgMonthlyGain, avgMonthlyLoss, gainLossRatioMonthly := CalcAvgGainLoss(req.MonthlyReturnValues)
	avgAnnualGain, avgAnnualLoss, gainLossRatioAnnual := CalcAvgGainLoss(req.AnnualReturnValues)

	// SWR/PWR
	pwr := CalcPWR(req.AnnualReturnValues)
	pwr10y, swr10y, pwr20y, swr20y, pwr30y, swr30y, pwr40y, swr40y := CalcPWRAllYears(req.AnnualReturnValues)

	avgYear := 0.0
	if len(req.AnnualReturnValues) > 0 {
		avgYear = mean(req.AnnualReturnValues)
	}

	// VaR/CVaR 各频率
	varDaily1 := CalcVaR(req.DailyReturns, 0.99)
	varDaily5 := CalcVaR(req.DailyReturns, 0.95)
	varDaily10 := CalcVaR(req.DailyReturns, 0.90)
	cvarDaily1 := CalcCVaR(req.DailyReturns, 0.99)
	cvarDaily5 := CalcCVaR(req.DailyReturns, 0.95)
	cvarDaily10 := CalcCVaR(req.DailyReturns, 0.90)

	varMonthly1 := CalcVaR(req.MonthlyReturnValues, 0.99)
	varMonthly5 := CalcVaR(req.MonthlyReturnValues, 0.95)
	varMonthly10 := CalcVaR(req.MonthlyReturnValues, 0.90)
	cvarMonthly1 := CalcCVaR(req.MonthlyReturnValues, 0.99)
	cvarMonthly5 := CalcCVaR(req.MonthlyReturnValues, 0.95)
	cvarMonthly10 := CalcCVaR(req.MonthlyReturnValues, 0.90)

	varAnnual1 := CalcVaR(req.AnnualReturnValues, 0.99)
	varAnnual5 := CalcVaR(req.AnnualReturnValues, 0.95)
	varAnnual10 := CalcVaR(req.AnnualReturnValues, 0.90)
	cvarAnnual1 := CalcCVaR(req.AnnualReturnValues, 0.99)
	cvarAnnual5 := CalcCVaR(req.AnnualReturnValues, 0.95)
	cvarAnnual10 := CalcCVaR(req.AnnualReturnValues, 0.90)

	// Skewness/Kurtosis 各频率
	skewnessDaily := CalcSkewness(req.DailyReturns)
	skewnessMonthly := CalcSkewness(req.MonthlyReturnValues)
	skewnessAnnual := CalcSkewness(req.AnnualReturnValues)
	excessKurtosisDaily := CalcExcessKurtosis(req.DailyReturns)
	excessKurtosisMonthly := CalcExcessKurtosis(req.MonthlyReturnValues)
	excessKurtosisAnnual := CalcExcessKurtosis(req.AnnualReturnValues)

	// Capture spread
	captureSpreadDaily := upsideDaily - downsideDaily
	captureSpreadAnnual := upsideAnnual - downsideAnnual
	captureSpread := captureSpreadDaily

	return Statistics{
		CAGR:                  cagr,
		MWRR:                  mwrr,
		Stdev:                 stdevDaily,
		Sharpe:                sharpe,
		Sortino:               sortino,
		MaxDrawdown:           dd.MaxDrawdown,
		MaxDrawdownDuration:   dd.MaxDrawdownDuration,
		BestYear:              maxAnnualReturn,
		WorstYear:             minAnnualReturn,
		AvgYear:               avgYear,
		TotalReturn:           totalReturn,
		MaxMonthlyReturn:      MaxValue(req.MonthlyReturnValues),
		MinMonthlyReturn:      MinValue(req.MonthlyReturnValues),
		AvgDrawdown:           avgDD,
		UlcerIndex:            ulcerIdx,
		Calmar:                calmar,
		UlcerPerformanceIndex: upi,
		Beta:                  beta,
		Alpha:                 alpha,
		RSquared:              rSq,
		TrackingError:         trackingErr,
		InformationRatio:      infoRatio,
		UpsideCapture:         upsideDaily,
		DownsideCapture:       downsideDaily,
		MaxDailyReturn:        maxDailyRet,
		MinDailyReturn:        minDailyRet,
		PWR:                   pwr,
		Var: VaRByFrequency{
			Daily:   VaRLevels{One: varDaily1, Five: varDaily5, Ten: varDaily10},
			Monthly: VaRLevels{One: varMonthly1, Five: varMonthly5, Ten: varMonthly10},
			Annual:  VaRLevels{One: varAnnual1, Five: varAnnual5, Ten: varAnnual10},
		},
		Cvar: VaRByFrequency{
			Daily:   VaRLevels{One: cvarDaily1, Five: cvarDaily5, Ten: cvarDaily10},
			Monthly: VaRLevels{One: cvarMonthly1, Five: cvarMonthly5, Ten: cvarMonthly10},
			Annual:  VaRLevels{One: cvarAnnual1, Five: cvarAnnual5, Ten: cvarAnnual10},
		},
		Skewness: SkewnessByFrequency{
			Daily:   skewnessDaily,
			Monthly: skewnessMonthly,
			Annual:  skewnessAnnual,
		},
		ExcessKurtosis: SkewnessByFrequency{
			Daily:   excessKurtosisDaily,
			Monthly: excessKurtosisMonthly,
			Annual:  excessKurtosisAnnual,
		},
		WinRate: SkewnessByFrequency{
			Daily:   pctPositiveDays,
			Monthly: pctPositiveMonths,
			Annual:  pctPositiveYears,
		},
		PctPositiveDays: pctPositiveDays,

		AvgAnnualReturn:             avgAnnualReturn,
		AvgMonthlyReturn:            avgMonthlyReturn,
		AvgDailyReturn:              avgDailyReturn,
		StdevAnnual:                 stdevAnnual,
		StdevMonthly:                stdevMonthly,
		StdevMonthlyRaw:             stdevMonthlyRaw,
		StdevDaily:                  stdevDaily,
		StdevDailyRaw:               stdevDailyRaw,
		DownsideDeviation:           downsideDeviation,
		DownsideDeviationDailyRaw:   downsideDeviationDailyRaw,
		DownsideDeviationMonthly:    downsideDeviationMonthly,
		DownsideDeviationMonthlyRaw: downsideDeviationMonthlyRaw,
		DownsideDeviationAnnual:     downsideDeviationAnnual,
		DrawdownRecoveryFactor:      drawdownRecoveryFactor,
		M2:                          m2,
		Treynor:                     treynor,
		DiversificationRatio:        1,
		BenchmarkCorrelation:        benchmarkCorrelation,
		UpsideCorrelation:           upsideCorr,
		DownsideCorrelation:         downsideCorr,
		UpsideBeta:                  upsideBetaVal,
		DownsideBeta:                downsideBetaVal,
		AlphaDaily:                  alphaDaily,
		AlphaAnnualized:             alpha,
		UpsideCaptureDaily:          upsideDaily,
		DownsideCaptureDaily:        downsideDaily,
		CaptureSpreadDaily:          captureSpreadDaily,
		UpsideCaptureAnnual:         upsideAnnual,
		DownsideCaptureAnnual:       downsideAnnual,
		CaptureSpreadAnnual:         captureSpreadAnnual,
		CaptureSpread:               captureSpread,
		ActiveReturn:                activeReturn,
		VarDaily1:                   varDaily1,
		VarDaily5:                   varDaily5,
		VarDaily10:                  varDaily10,
		CvarDaily1:                  cvarDaily1,
		CvarDaily5:                  cvarDaily5,
		CvarDaily10:                 cvarDaily10,
		VarMonthly1:                 varMonthly1,
		VarMonthly5:                 varMonthly5,
		VarMonthly10:                varMonthly10,
		CvarMonthly1:                cvarMonthly1,
		CvarMonthly5:                cvarMonthly5,
		CvarMonthly10:               cvarMonthly10,
		VarAnnual1:                  varAnnual1,
		VarAnnual5:                  varAnnual5,
		VarAnnual10:                 varAnnual10,
		CvarAnnual1:                 cvarAnnual1,
		CvarAnnual5:                 cvarAnnual5,
		CvarAnnual10:                cvarAnnual10,
		SkewnessDaily:               skewnessDaily,
		SkewnessMonthly:             skewnessMonthly,
		SkewnessAnnual:              skewnessAnnual,
		ExcessKurtosisDaily:         excessKurtosisDaily,
		ExcessKurtosisMonthly:       excessKurtosisMonthly,
		ExcessKurtosisAnnual:        excessKurtosisAnnual,
		PctPositiveMonths:           pctPositiveMonths,
		PctPositiveYears:            pctPositiveYears,
		MaxAnnualReturn:             maxAnnualReturn,
		MinAnnualReturn:             minAnnualReturn,
		AvgDailyGain:                avgDailyGain,
		AvgDailyLoss:                avgDailyLoss,
		GainLossRatioDaily:          gainLossRatioDaily,
		AvgMonthlyGain:              avgMonthlyGain,
		AvgMonthlyLoss:              avgMonthlyLoss,
		GainLossRatioMonthly:        gainLossRatioMonthly,
		AvgAnnualGain:               avgAnnualGain,
		AvgAnnualLoss:               avgAnnualLoss,
		GainLossRatioAnnual:         gainLossRatioAnnual,
		SWR:                         swr30y,
		SWR10Y:                      swr10y,
		PWR10Y:                      pwr10y,
		SWR20Y:                      swr20y,
		PWR20Y:                      pwr20y,
		SWR30Y:                      swr30y,
		PWR30Y:                      pwr30y,
		SWR40Y:                      swr40y,
		PWR40Y:                      pwr40y,
	}
}
