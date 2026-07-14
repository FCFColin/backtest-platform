package engine

// computeStatistics 从曲线和回撤数据计算统计指标
// 企业理由：统一统计计算入口，确保所有指标口径一致。
// ddCurve 参数保留作为扩展点，用于未来按回撤曲线计算条件回撤等高级指标
func computeStatistics(curve []DataPoint, episodes []DrawdownEpisode, benchCurve []DataPoint) Statistics {
	if len(curve) < 2 {
		return Statistics{}
	}

	startValue := curve[0].Value
	endValue := curve[len(curve)-1].Value
	years := float64(len(curve)) / float64(tradingDays)

	dailyRets := dailyReturns(curve)
	values := extractValues(curve)

	cagr := CalcCAGR(startValue, endValue, years)
	stdev := CalcAnnualizedStdev(dailyRets)
	mdResult := CalcMaxDrawdown(values)
	avgDD := CalcAvgDrawdown(values)
	ulcerIdx := CalcUlcerIndex(values)
	calmar := CalcCalmar(cagr, mdResult.MaxDrawdown)
	upi := CalcUPI(cagr, ulcerIdx)
	sortino := CalcSortino(cagr, dailyRets)

	// 年度/月度收益
	annualRets := annualReturnsFromCurve(curve)
	monthlyRets := monthlyReturnsFromCurve(curve)

	annualReturnValues := make([]float64, len(annualRets))
	for i, ar := range annualRets {
		annualReturnValues[i] = ar.Return
	}
	monthlyReturnValues := make([]float64, len(monthlyRets))
	for i, mr := range monthlyRets {
		monthlyReturnValues[i] = mr.Return
	}

	// MWRR
	mwrr := 0.0
	if endValue > 0 {
		mwrr = CalcMWRR([]struct {
			Value float64
			Time  float64
		}{
			{Value: -startValue, Time: 0},
			{Value: endValue, Time: years},
		})
	}

	// 基准相关指标
	beta := 0.0
	alpha := 0.0
	rSquared := 0.0
	trackingError := 0.0
	informationRatio := 0.0
	upsideCapture := 0.0
	downsideCapture := 0.0

	if len(benchCurve) >= 2 {
		benchDailyRets := dailyReturns(benchCurve)
		benchEndValue := benchCurve[len(benchCurve)-1].Value
		benchYears := float64(len(benchCurve)) / float64(tradingDays)
		benchCagr := CalcCAGR(benchCurve[0].Value, benchEndValue, benchYears)

		beta = CalcBeta(dailyRets, benchDailyRets)
		alpha = CalcAlpha(cagr, beta, benchCagr)
		rSquared = CalcRSquared(dailyRets, benchDailyRets)
		trackingError = CalcTrackingError(dailyRets, benchDailyRets)
		informationRatio = CalcInformationRatio(alpha, trackingError)
		upsideCapture = CalcUpsideCapture(dailyRets, benchDailyRets)
		downsideCapture = CalcDownsideCapture(dailyRets, benchDailyRets)
	}

	// VaR / CVaR
	var5 := CalcVaR(dailyRets, 0.95)
	cvar5 := CalcCVaR(dailyRets, 0.95)

	// 分布特征
	skewness := CalcSkewness(dailyRets)
	excessKurtosis := CalcExcessKurtosis(dailyRets)

	// 辅助指标
	totalReturn := CalcTotalReturn(startValue, endValue)
	pctPositiveDays := ratioPositive(dailyRets)
	maxDailyReturn := maxValue(dailyRets)
	minDailyReturn := minValue(dailyRets)

	pwr := CalcPWR(annualReturnValues)

	avgYear := mean(annualReturnValues)

	return Statistics{
		CAGR:                  cagr,
		MWRR:                  mwrr,
		Stdev:                 stdev,
		Sharpe:                CalcSharpe(cagr, stdev),
		Sortino:               sortino,
		MaxDrawdown:           mdResult.MaxDrawdown,
		MaxDrawdownDuration:   mdResult.MaxDrawdownDuration,
		BestYear:              CalcBestYear(annualReturnValues),
		WorstYear:             CalcWorstYear(annualReturnValues),
		AvgYear:               avgYear,
		TotalReturn:           totalReturn,
		MaxMonthlyReturn:      CalcBestMonth(monthlyReturnValues),
		MinMonthlyReturn:      CalcWorstMonth(monthlyReturnValues),
		AvgDrawdown:           avgDD,
		UlcerIndex:            ulcerIdx,
		Calmar:                calmar,
		UlcerPerformanceIndex: upi,
		Beta:                  beta,
		Alpha:                 alpha,
		RSquared:              rSquared,
		TrackingError:         trackingError,
		InformationRatio:      informationRatio,
		UpsideCapture:         upsideCapture,
		DownsideCapture:       downsideCapture,
		VaR5:                  var5,
		CVaR5:                 cvar5,
		Skewness:              skewness,
		ExcessKurtosis:        excessKurtosis,
		PctPositiveDays:       pctPositiveDays,
		MaxDailyReturn:        maxDailyReturn,
		MinDailyReturn:        minDailyReturn,
		PWR:                   pwr,
	}
}

// computeCorrelationMatrix 计算相关性矩阵
func computeCorrelationMatrix(dailyReturnsList [][]float64) [][]float64 {
	n := len(dailyReturnsList)
	matrix := make([][]float64, n)
	for i := range matrix {
		matrix[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			if i == j {
				matrix[i][j] = 1
			} else if j < i {
				matrix[i][j] = matrix[j][i]
			} else {
				matrix[i][j] = CalcCorrelation(dailyReturnsList[i], dailyReturnsList[j])
			}
		}
	}
	return matrix
}

// annualReturnsFromCurve 从 DataPoint 曲线计算年度收益
func annualReturnsFromCurve(curve []DataPoint) []AnnualReturn {
	if len(curve) < 2 {
		return nil
	}
	values := extractValues(curve)
	dates := extractDates(curve)
	return CalcAnnualReturns(values, dates)
}

// monthlyReturnsFromCurve 从 DataPoint 曲线计算月度收益
func monthlyReturnsFromCurve(curve []DataPoint) []MonthlyReturn {
	if len(curve) < 2 {
		return nil
	}
	values := extractValues(curve)
	dates := extractDates(curve)
	return CalcMonthlyReturns(values, dates)
}

// extractValues 从 DataPoint 曲线提取值序列
func extractValues(curve []DataPoint) []float64 {
	values := make([]float64, len(curve))
	for i, dp := range curve {
		values[i] = dp.Value
	}
	return values
}

// extractDates 从 DataPoint 曲线提取日期序列
func extractDates(curve []DataPoint) []string {
	dates := make([]string, len(curve))
	for i, dp := range curve {
		dates[i] = dp.Date
	}
	return dates
}
