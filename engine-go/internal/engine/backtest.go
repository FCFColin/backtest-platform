// Package engine 提供回测核心计算逻辑。
//
// 企业理由（ADR-008）：从 Rust 引擎移植到 Go，使用 Go 标准库实现
// 统计指标计算。所有 JSON 字段使用 camelCase，与前端 TypeScript 接口一致。
// 权衡：Go 数值计算性能约为 Rust 的 70-90%，但回测平台对延迟要求为秒级，可接受。
package engine

import (
	"fmt"
	"sort"
	"time"
)

// RunBacktest 执行完整回测，是引擎的主入口函数
//
// 企业理由：统一入口处理请求解析、增长曲线计算、统计指标计算、
// 相关性计算等所有步骤。与 Rust 引擎的 RunBacktest 函数签名兼容，
// 支持 A/B 测试验证计算结果一致性。
func RunBacktest(req BacktestRequest) (*BacktestResult, error) {
	// 1. 解析并排序所有交易日
	tradingDates, err := parseTradingDates(req.PriceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}

	// 2. 应用日期范围过滤
	tradingDates = filterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	if len(tradingDates) == 0 {
		return nil, fmt.Errorf("日期范围内无交易数据")
	}

	// 3. 收集所有资产 ticker
	assetTickers := collectAssetTickers(req.PriceData)
	sort.Strings(assetTickers)

	// 4. 计算每个组合的增长曲线
	portfolioResults := make([]PortfolioResult, 0, len(req.Portfolios))
	portfolioDailyReturns := make([][]float64, 0, len(req.Portfolios))

	for _, pf := range req.Portfolios {
		curve, allocHist, err := computeGrowthCurve(pf, req.PriceData, req.CPIData, req.ExchangeRates, tradingDates, req.Params)
		if err != nil {
			return nil, fmt.Errorf("组合 %s 计算失败: %w", pf.Name, err)
		}

		ddCurve := computeDrawdownCurve(curve)
		episodes := detectDrawdownEpisodes(curve)

		// 基准增长曲线（用于 Alpha/Beta 等指标）
		var benchCurve []DataPoint
		if req.Params.BenchmarkTicker != "" {
			benchCurve = computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, req.ExchangeRates, tradingDates, req.Params)
		}

		stats := computeStatistics(curve, ddCurve, episodes, benchCurve)

		// 滚动收益
		rollingReturns := computeRollingReturns(curve, req.Params.RollingWindowMonths)

		// 年度/月度收益
		annualRets := annualReturnsFromCurve(curve)
		monthlyRets := monthlyReturnsFromCurve(curve)

		portfolioResults = append(portfolioResults, PortfolioResult{
			Name:              pf.Name,
			GrowthCurve:       curve,
			DrawdownCurve:     ddCurve,
			RollingReturns:    rollingReturns,
			AnnualReturns:     annualRets,
			MonthlyReturns:    monthlyRets,
			Statistics:        stats,
			DrawdownEpisodes:  episodes,
			AllocationHistory: allocHist,
		})

		portfolioDailyReturns = append(portfolioDailyReturns, dailyReturns(curve))
	}

	// 5. 计算组合间相关性矩阵
	correlations := computeCorrelationMatrix(portfolioDailyReturns)

	// 6. 计算基准增长曲线
	var benchmarkGrowth []DataPoint
	if req.Params.BenchmarkTicker != "" {
		benchmarkGrowth = computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, req.ExchangeRates, tradingDates, req.Params)
	}

	// 7. 计算资产间相关性矩阵
	assetDailyReturns := make([][]float64, 0, len(assetTickers))
	for _, ticker := range assetTickers {
		prices := extractPrices(req.PriceData, ticker, tradingDates)
		assetDailyReturns = append(assetDailyReturns, dailyReturnsFromPrices(prices))
	}
	assetCorrelations := computeCorrelationMatrix(assetDailyReturns)

	return &BacktestResult{
		Portfolios:        portfolioResults,
		Correlations:      correlations,
		BenchmarkGrowth:   benchmarkGrowth,
		AssetTickers:      assetTickers,
		AssetCorrelations: assetCorrelations,
	}, nil
}

// computeGrowthCurve 计算组合增长曲线——回测的核心算法
//
// 企业理由：逐日迭代是回测引擎的核心。每天根据各资产价格更新持有份额，
// 处理再平衡、拖累（drag）、通胀调整等操作。这是与 Rust 引擎
// 计算结果一致性的关键函数。
func computeGrowthCurve(
	pf PortfolioInput,
	priceData PriceDataMap,
	cpiData map[string]float64,
	exchangeRates map[string]float64,
	tradingDates []time.Time,
	params BacktestParams,
) ([]DataPoint, []AllocationPoint, error) {

	startValue := params.StartingValue
	if startValue <= 0 {
		startValue = 10000
	}

	// 构建目标权重映射
	targetWeights := make(map[string]float64, len(pf.Assets))
	for _, a := range pf.Assets {
		targetWeights[a.Ticker] = a.Weight / 100.0 // 企业理由：前端传入百分比（如60），内部转换为小数（0.6）
	}

	// 初始化持有份额
	shares := make(map[string]float64, len(pf.Assets))
	firstPrices := make(map[string]float64, len(pf.Assets))
	for _, a := range pf.Assets {
		price := getPrice(priceData, a.Ticker, tradingDates[0])
		if price <= 0 {
			return nil, nil, fmt.Errorf("资产 %s 在 %s 无有效价格", a.Ticker, tradingDates[0].Format("2006-01-02"))
		}
		firstPrices[a.Ticker] = price
		weight := targetWeights[a.Ticker]
		shares[a.Ticker] = (startValue * weight) / price
	}

	curve := make([]DataPoint, 0, len(tradingDates))
	allocHistory := make([]AllocationPoint, 0, len(tradingDates))

	state := &dailyState{
		value:   startValue,
		shares:  shares,
		weights: targetWeights,
	}

	lastRebalanceDate := tradingDates[0]

	for i, date := range tradingDates {
		dateStr := date.Format("2006-01-02")

		// 获取当日各资产价格
		prices := make(map[string]float64, len(pf.Assets))
		for _, a := range pf.Assets {
			prices[a.Ticker] = getPrice(priceData, a.Ticker, date)
		}

		// 计算组合总价值
		totalValue := 0.0
		for _, a := range pf.Assets {
			totalValue += state.shares[a.Ticker] * prices[a.Ticker]
		}

		// 企业理由：汇率调整——如果提供了汇率数据，将组合价值转换为目标货币
		// TODO: 汇率转换逻辑待实现，当前仅占位
		if _, ok := exchangeRates[dateStr]; ok {
			// 汇率转换待实现
		}

		// 企业理由：拖累（drag）——模拟管理费、交易成本等持续性损耗
		// 每日扣除 drag/252 的比例
		if pf.Drag > 0 && i > 0 {
			dailyDrag := 1.0 - pf.Drag/float64(tradingDays)
			for ticker := range state.shares {
				state.shares[ticker] *= dailyDrag
			}
			totalValue *= dailyDrag
		}

		// 通胀调整
		if params.AdjustForInflation {
			if _, ok := cpiData[dateStr]; ok {
				// TODO: CPI 通胀调整逻辑待实现，当前仅占位
			}
		}

		// 记录当前权重
		currentWeights := computeCurrentWeights(state.shares, prices)
		weightSlice := make([]float64, 0, len(pf.Assets))
		for _, a := range pf.Assets {
			weightSlice = append(weightSlice, currentWeights[a.Ticker])
		}

		// 再平衡判断
		thresholdDrift := 0.0
		if pf.RebalanceFrequency == "threshold" && pf.RebalanceThreshold > 0 {
			thresholdDrift = maxWeightDrift(currentWeights, targetWeights) - pf.RebalanceThreshold
		}

		if i > 0 && shouldRebalance(pf.RebalanceFrequency, date, lastRebalanceDate, thresholdDrift) {
			rebalance(state, prices)
			lastRebalanceDate = date
			totalValue = 0.0
			for _, a := range pf.Assets {
				totalValue += state.shares[a.Ticker] * prices[a.Ticker]
			}
			// 更新权重记录
			currentWeights = computeCurrentWeights(state.shares, prices)
			weightSlice = make([]float64, 0, len(pf.Assets))
			for _, a := range pf.Assets {
				weightSlice = append(weightSlice, currentWeights[a.Ticker])
			}
		}

		// Total Return 模式：将分红再投资
		// 企业理由：totalReturn=true 时假设分红全部再投资，反映总回报
		// Intentional: 当前价格数据已包含分红调整（复权价格），无需额外再投资计算；
		// 保留此分支以便未来切换到未复权数据源时插入分红再投资逻辑。
		if pf.TotalReturn && i > 0 {
		}

		curve = append(curve, DataPoint{Date: dateStr, Value: totalValue})
		allocHistory = append(allocHistory, AllocationPoint{Date: dateStr, Weights: weightSlice})
		state.value = totalValue
	}

	return curve, allocHistory, nil
}

// computeBenchmarkGrowth 计算基准增长曲线
// TODO: exchangeRates 参数当前未使用，预留未来支持多币种基准换算
func computeBenchmarkGrowth(
	benchmarkTicker string,
	priceData PriceDataMap,
	exchangeRates map[string]float64, // TODO: 预留多币种换算，当前基准与组合同币种无需换算
	tradingDates []time.Time,
	params BacktestParams,
) []DataPoint {
	startValue := params.StartingValue
	if startValue <= 0 {
		startValue = 10000
	}

	prices := extractPrices(priceData, benchmarkTicker, tradingDates)
	if len(prices) < 2 || prices[0] <= 0 {
		return nil
	}

	curve := make([]DataPoint, len(prices))
	startPrice := prices[0]
	for i, p := range prices {
		value := startValue * (p / startPrice)
		curve[i] = DataPoint{
			Date:  tradingDates[i].Format("2006-01-02"),
			Value: value,
		}
	}
	return curve
}

// computeRollingReturns 计算滚动收益率
//
// 企业理由：滚动收益率展示不同时间窗口的收益分布，
// 帮助投资者理解策略在不同持有期的表现。
func computeRollingReturns(curve []DataPoint, windowMonths int) []DataPoint {
	if len(curve) < 2 || windowMonths <= 0 {
		return nil
	}

	// 企业理由：将月数转换为近似交易日数
	windowDays := int(float64(windowMonths) * float64(tradingDays) / 12.0)
	if windowDays < 1 {
		windowDays = 1
	}

	result := make([]DataPoint, 0)
	for i := windowDays; i < len(curve); i++ {
		if curve[i-windowDays].Value > 0 {
			rollingRet := (curve[i].Value - curve[i-windowDays].Value) / curve[i-windowDays].Value
			result = append(result, DataPoint{
				Date:  curve[i].Date,
				Value: rollingRet,
			})
		}
	}
	return result
}

// ============================================================
// 辅助函数
// ============================================================

// parseTradingDates 从价格数据中提取所有交易日并排序
// TODO: 当前始终返回 nil error；预留未来对日期格式异常的严格校验
func parseTradingDates(priceData PriceDataMap) ([]time.Time, error) {
	dateSet := make(map[time.Time]bool)
	for _, tickerData := range priceData {
		for dateStr := range tickerData {
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				continue
			}
			dateSet[t] = true
		}
	}

	dates := make([]time.Time, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Slice(dates, func(i, j int) bool {
		return dates[i].Before(dates[j])
	})

	return dates, nil
}

// filterByDateRange 按日期范围过滤交易日
func filterByDateRange(dates []time.Time, startDate, endDate string) []time.Time {
	var start, end time.Time
	if startDate != "" {
		start, _ = time.Parse("2006-01-02", startDate) //nolint:errcheck // 企业理由：解析失败时 start 为零值，IsZero() 检查会跳过该过滤条件
	}
	if endDate != "" {
		end, _ = time.Parse("2006-01-02", endDate) //nolint:errcheck // 企业理由：解析失败时 end 为零值，IsZero() 检查会跳过该过滤条件
	}

	filtered := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		if !start.IsZero() && d.Before(start) {
			continue
		}
		if !end.IsZero() && d.After(end) {
			continue
		}
		filtered = append(filtered, d)
	}
	return filtered
}

// collectAssetTickers 收集所有资产 ticker
func collectAssetTickers(priceData PriceDataMap) []string {
	tickers := make(map[string]bool)
	for t := range priceData {
		tickers[t] = true
	}
	result := make([]string, 0, len(tickers))
	for t := range tickers {
		result = append(result, t)
	}
	return result
}

// getPrice 获取指定日期的资产价格
func getPrice(priceData PriceDataMap, ticker string, date time.Time) float64 {
	tickerData, ok := priceData[ticker]
	if !ok {
		return 0
	}
	dateStr := date.Format("2006-01-02")
	price, ok := tickerData[dateStr]
	if !ok {
		return 0
	}
	return price
}

// extractPrices 提取指定资产在交易日序列上的价格
func extractPrices(priceData PriceDataMap, ticker string, dates []time.Time) []float64 {
	prices := make([]float64, 0, len(dates))
	for _, d := range dates {
		p := getPrice(priceData, ticker, d)
		prices = append(prices, p)
	}
	return prices
}

// dailyReturnsFromPrices 从价格序列计算日收益率
func dailyReturnsFromPrices(prices []float64) []float64 {
	if len(prices) < 2 {
		return nil
	}
	rets := make([]float64, 0, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		if prices[i-1] > 0 {
			rets = append(rets, (prices[i]-prices[i-1])/prices[i-1])
		}
	}
	return rets
}

// dailyReturns 从 DataPoint 曲线计算日收益率
func dailyReturns(curve []DataPoint) []float64 {
	if len(curve) < 2 {
		return nil
	}
	rets := make([]float64, 0, len(curve)-1)
	for i := 1; i < len(curve); i++ {
		if curve[i-1].Value > 0 {
			rets = append(rets, (curve[i].Value-curve[i-1].Value)/curve[i-1].Value)
		}
	}
	return rets
}

// computeStatistics 从曲线和回撤数据计算统计指标
// 企业理由：统一统计计算入口，确保所有指标口径一致。
// TODO: ddCurve 参数当前未使用，预留未来按回撤曲线计算条件回撤等高级指标
func computeStatistics(curve []DataPoint, ddCurve []DrawdownPoint, episodes []DrawdownEpisode, benchCurve []DataPoint) Statistics {
	if len(curve) < 2 {
		return Statistics{}
	}

	startValue := curve[0].Value
	endValue := curve[len(curve)-1].Value
	years := float64(len(curve)) / float64(tradingDays)

	dailyRets := dailyReturns(curve)

	cagr := CalcCAGR(startValue, endValue, years)
	stdev := CalcAnnualizedStdev(dailyRets)
	mdResult := CalcMaxDrawdown(extractValues(curve))
	avgDD := CalcAvgDrawdown(extractValues(curve))
	ulcerIdx := CalcUlcerIndex(extractValues(curve))
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
	pctPositiveDays := 0.0
	if len(dailyRets) > 0 {
		positiveCount := 0
		for _, r := range dailyRets {
			if r > 0 {
				positiveCount++
			}
		}
		pctPositiveDays = float64(positiveCount) / float64(len(dailyRets))
	}
	maxDailyReturn := 0.0
	minDailyReturn := 0.0
	if len(dailyRets) > 0 {
		maxDailyReturn = dailyRets[0]
		minDailyReturn = dailyRets[0]
		for _, r := range dailyRets[1:] {
			if r > maxDailyReturn {
				maxDailyReturn = r
			}
			if r < minDailyReturn {
				minDailyReturn = r
			}
		}
	}

	pwr := CalcPWR(annualReturnValues)

	avgYear := 0.0
	if len(annualReturnValues) > 0 {
		sum := 0.0
		for _, r := range annualReturnValues {
			sum += r
		}
		avgYear = sum / float64(len(annualReturnValues))
	}

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
