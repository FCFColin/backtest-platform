package engine

// computeStatistics 从曲线和回撤数据计算统计指标
// 企业理由：统一统计计算入口，将所有指标的计算委托给 CalculateStatisticsFromRequest。
func computeStatistics(curve []DataPoint, episodes []DrawdownEpisode, benchCurve []DataPoint) Statistics {
	if len(curve) < 2 {
		return Statistics{}
	}

	values := extractValues(curve)
	dates := extractDates(curve)
	startValue := curve[0].Value
	endValue := curve[len(curve)-1].Value

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

	// 基准相关
	var benchDailyReturns []float64
	var benchmarkCagr *float64
	if len(benchCurve) >= 2 {
		benchValues := extractValues(benchCurve)
		benchDailyReturns = dailyReturns(benchValues)
		yrs := float64(len(benchCurve)) / float64(tradingDays)
		c := CalcCAGR(benchCurve[0].Value, benchCurve[len(benchCurve)-1].Value, yrs)
		benchmarkCagr = &c
	}

	result := CalculateStatisticsFromRequest(StatisticsRequest{
		Values:                values,
		Dates:                 dates,
		StartingValue:         startValue,
		DailyReturns:          dailyReturns(values),
		AnnualReturnValues:    annualReturnValues,
		MonthlyReturnValues:   monthlyReturnValues,
		MwrrCashflows:         []Cashflow{{Value: -startValue, Time: 0}},
		BenchmarkDailyReturns: benchDailyReturns,
		BenchmarkCagr:         benchmarkCagr,
	})

	if endValue <= 0 {
		result.MWRR = 0
	}

	return result
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
