package engine

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
	stdev := CalcAnnualizedStdev(req.DailyReturns)
	dd := CalcMaxDrawdown(req.Values)
	avgDD := CalcAvgDrawdown(req.Values)
	ulcerIdx := CalcUlcerIndex(req.Values)
	calmar := CalcCalmar(cagr, dd.MaxDrawdown)
	upi := CalcUPI(cagr, ulcerIdx)
	sortino := CalcSortino(cagr, req.DailyReturns)

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
	beta, alpha, rSq, trackingErr, infoRatio, upside, downside := 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
	if len(req.BenchmarkDailyReturns) >= 2 && req.BenchmarkCagr != nil {
		bench := req.BenchmarkDailyReturns
		beta = CalcBeta(req.DailyReturns, bench)
		alpha = CalcAlpha(cagr, beta, *req.BenchmarkCagr)
		rSq = CalcRSquared(req.DailyReturns, bench)
		trackingErr = CalcTrackingError(req.DailyReturns, bench)
		infoRatio = CalcInformationRatio(alpha, trackingErr)
		upside = CalcUpsideCapture(req.DailyReturns, bench)
		downside = CalcDownsideCapture(req.DailyReturns, bench)
	}

	totalReturn := CalcTotalReturn(req.StartingValue, finalValue)
	pctPositiveDays := ratioPositive(req.DailyReturns)
	maxDailyRet := MaxValue(req.DailyReturns)
	minDailyRet := MinValue(req.DailyReturns)
	pwr := CalcPWR(req.AnnualReturnValues)
	avgYear := 0.0
	if len(req.AnnualReturnValues) > 0 {
		avgYear = mean(req.AnnualReturnValues)
	}

	varDaily1 := CalcVaR(req.DailyReturns, 0.99)
	varDaily5 := CalcVaR(req.DailyReturns, 0.95)
	varDaily10 := CalcVaR(req.DailyReturns, 0.90)
	cvarDaily1 := CalcCVaR(req.DailyReturns, 0.99)
	cvarDaily5 := CalcCVaR(req.DailyReturns, 0.95)
	cvarDaily10 := CalcCVaR(req.DailyReturns, 0.90)
	skewnessDaily := CalcSkewness(req.DailyReturns)
	excessKurtosisDaily := CalcExcessKurtosis(req.DailyReturns)

	return Statistics{
		CAGR:                  cagr,
		MWRR:                  mwrr,
		Stdev:                 stdev,
		Sharpe:                CalcSharpe(cagr, stdev),
		Sortino:               sortino,
		MaxDrawdown:           dd.MaxDrawdown,
		MaxDrawdownDuration:   dd.MaxDrawdownDuration,
		BestYear:              MaxValue(req.AnnualReturnValues),
		WorstYear:             MinValue(req.AnnualReturnValues),
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
		UpsideCapture:         upside,
		DownsideCapture:       downside,
		MaxDailyReturn:        maxDailyRet,
		MinDailyReturn:        minDailyRet,
		PWR:                   pwr,
		Var: VaRByFrequency{
			Daily:   VaRLevels{One: varDaily1, Five: varDaily5, Ten: varDaily10},
			Monthly: VaRLevels{},
			Annual:  VaRLevels{},
		},
		Cvar: VaRByFrequency{
			Daily:   VaRLevels{One: cvarDaily1, Five: cvarDaily5, Ten: cvarDaily10},
			Monthly: VaRLevels{},
			Annual:  VaRLevels{},
		},
		Skewness: SkewnessByFrequency{
			Daily:   skewnessDaily,
			Monthly: 0,
			Annual:  0,
		},
		ExcessKurtosis: SkewnessByFrequency{
			Daily:   excessKurtosisDaily,
			Monthly: 0,
			Annual:  0,
		},
		WinRate: SkewnessByFrequency{
			Daily:   pctPositiveDays,
			Monthly: 0,
			Annual:  0,
		},
		PctPositiveDays: pctPositiveDays,
	}
}

