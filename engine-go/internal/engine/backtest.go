// Package engine 提供回测核心计算逻辑。
//
// 企业理由（ADR-008）：从 Rust 引擎移植到 Go，使用 Go 标准库实现
// 统计指标计算。所有 JSON 字段使用 camelCase，与前端 TypeScript 接口一致。
// 权衡：Go 数值计算性能约为 Rust 的 70-90%，但回测平台对延迟要求为秒级，可接受。
package engine

import (
	"fmt"
	"math"
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
// 处理再平衡、拖累（drag）、汇率换算、现金流、glidepath 与通胀调整等操作。
//
// ADR-008：本实现与 Rust 引擎 run_single 的净值生成逻辑逐行对齐，
// 涵盖复利拖累 (1-drag/100)^(1/252)、汇率换算（含回溯查找）、CPI 通胀调整、
// 定期/一次性现金流、glidepath 线性插值、再平衡偏离带与清算处理，
// 确保 Go 主引擎与 Rust 回退引擎计算结果一致（一致性测试 < 0.01%）。
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

	n := len(pf.Assets)
	if n == 0 {
		return nil, nil, fmt.Errorf("组合 %s 无资产", pf.Name)
	}

	// 归一化权重（与 Rust run_single 一致）：前端传入百分比，
	// 转为小数后按总和归一化；总和为 0 时退化为等权重。
	weights := make([]float64, n)
	rawSum := 0.0
	for i, a := range pf.Assets {
		weights[i] = a.Weight / 100.0
		rawSum += weights[i]
	}
	if rawSum == 0 {
		for i := range weights {
			weights[i] = 1.0 / float64(n)
		}
	} else {
		for i := range weights {
			weights[i] /= rawSum
		}
	}

	// 交易日序列（字符串），来源于已按日期范围过滤的 tradingDates。
	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates {
		dates[i] = d.Format("2006-01-02")
	}
	if len(dates) == 0 {
		return nil, nil, fmt.Errorf("组合 %s 日期范围内无数据", pf.Name)
	}

	// 汇率换算价格获取：若提供汇率数据，将原始价格乘以当日汇率；
	// 当日缺失时向前回溯最多 10 天查找最近汇率（与 Rust gp 闭包一致）。
	gp := func(ticker, date string) float64 {
		raw := 0.0
		if td, ok := priceData[ticker]; ok {
			raw = td[date]
		}
		if raw <= 0 {
			return 0
		}
		if len(exchangeRates) > 0 {
			if rate, ok := exchangeRates[date]; ok {
				return raw * rate
			}
			if d, err := time.Parse("2006-01-02", date); err == nil {
				search := d
				for k := 0; k < 10; k++ {
					search = search.AddDate(0, 0, -1)
					if rate, ok := exchangeRates[search.Format("2006-01-02")]; ok {
						return raw * rate
					}
				}
			}
		}
		return raw
	}

	holdings := make([]float64, n)
	for i := range holdings {
		holdings[i] = startValue * weights[i]
	}

	initPrices := make([]float64, n)
	for i, a := range pf.Assets {
		initPrices[i] = gp(a.Ticker, dates[0])
	}
	shares := make([]float64, n)
	for i := range shares {
		if initPrices[i] > 0 {
			shares[i] = holdings[i] / initPrices[i]
		}
	}
	lastPrices := make([]float64, n)

	// 复利日拖累因子：年化 drag 百分比转为日因子 (1-drag/100)^(1/252)。
	dailyDrag := 1.0
	if pf.Drag > 0 {
		dailyDrag = math.Pow(1.0-pf.Drag/100.0, 1.0/float64(tradingDays))
	}

	// Glidepath：目标权重需与资产数一致才启用，渐变年数默认 10。
	var glidepathTo []float64
	if len(pf.GlidepathToWeights) == n {
		glidepathTo = pf.GlidepathToWeights
	}
	glidepathYears := float64(pf.GlidepathYears)
	if glidepathYears == 0 {
		glidepathYears = 10
	}

	// 现金流预处理：一次性按日期索引，周期性展开为日期->金额映射。
	otcMap := make(map[string]float64)
	for _, cf := range params.OneTimeCashflows {
		amt := cf.Amount
		if cf.Type == "withdrawal" {
			amt = -amt
		}
		if amt != 0 {
			otcMap[cf.Date] += amt
		}
	}
	cfMap := buildPeriodicCashflowMap(params.CashflowLegs, dates)

	curve := make([]DataPoint, 0, len(dates))
	allocHistory := make([]AllocationPoint, 0)
	vals := make([]float64, 0, len(dates))
	liquidated := false
	prev := dates[0]
	lastRebalanceDi := 0

	for di, date := range dates {
		if liquidated {
			curve = append(curve, DataPoint{Date: date, Value: 0})
			vals = append(vals, 0)
			prev = date
			continue
		}

		for i, a := range pf.Assets {
			pr := gp(a.Ticker, date)
			if pr > 0 {
				lastPrices[i] = pr
			}
			eff := pr
			if eff <= 0 {
				eff = lastPrices[i]
			}
			if eff > 0 {
				holdings[i] = shares[i] * eff
			}
		}
		pv := sumFloat(holdings)

		// 复利拖累
		if dailyDrag != 1.0 {
			for i := range holdings {
				holdings[i] *= dailyDrag
			}
			pv = sumFloat(holdings)
		}

		// 当日目标权重（glidepath 线性插值）
		currentWeights := make([]float64, n)
		if glidepathTo != nil {
			progress := (float64(di) / float64(tradingDays)) / glidepathYears
			if progress > 1 {
				progress = 1
			}
			for i := range currentWeights {
				currentWeights[i] = weights[i] + (glidepathTo[i]-weights[i])*progress
			}
		} else {
			copy(currentWeights, weights)
		}

		// 现金流（周期性 + 一次性）
		cfAmount := cfMap[date] + otcMap[date]
		if cfAmount != 0 {
			pv += cfAmount
			if pv <= 0 {
				liquidated = true
				for i := range holdings {
					holdings[i] = 0
				}
				curve = append(curve, DataPoint{Date: date, Value: 0})
				vals = append(vals, 0)
				prev = date
				continue
			}
			for i := range holdings {
				holdings[i] = pv * currentWeights[i]
			}
			for i, a := range pf.Assets {
				pr := gp(a.Ticker, date)
				if pr > 0 {
					lastPrices[i] = pr
				}
				eff := pr
				if eff <= 0 {
					eff = lastPrices[i]
				}
				if eff > 0 {
					shares[i] = holdings[i] / eff
				} else {
					shares[i] = 0
				}
			}
		}

		if pv <= 0 {
			liquidated = true
			for i := range holdings {
				holdings[i] = 0
			}
			curve = append(curve, DataPoint{Date: date, Value: 0})
			vals = append(vals, 0)
			prev = date
			continue
		}

		if di > 0 && shouldRebalance(pf.RebalanceFrequency, prev, date, pf.RebalanceThreshold, holdings, currentWeights, pv, pf.RebalanceBands) {
			for i := range holdings {
				holdings[i] = pv * currentWeights[i]
			}
			for i, a := range pf.Assets {
				pr := gp(a.Ticker, date)
				if pr > 0 {
					lastPrices[i] = pr
				}
				eff := pr
				if eff <= 0 {
					eff = lastPrices[i]
				}
				if eff > 0 {
					shares[i] = holdings[i] / eff
				} else {
					shares[i] = 0
				}
			}
			lastRebalanceDi = di
		}

		curve = append(curve, DataPoint{Date: date, Value: pv})
		vals = append(vals, pv)

		// 权重快照：每 20 个交易日或调仓日记录一次（与 Rust 采样策略一致）。
		if di%20 == 0 || (di == lastRebalanceDi && di > 0) {
			snapshot := make([]float64, n)
			if pv > 0 {
				for i := range holdings {
					snapshot[i] = holdings[i] / pv
				}
			}
			allocHistory = append(allocHistory, AllocationPoint{Date: date, Weights: snapshot})
		}

		prev = date
	}

	// 通胀调整：用 CPI 将名义净值折算为实际净值（基期为首个交易日）。
	if params.AdjustForInflation && len(cpiData) > 0 {
		startCPI := findCPIForDate(dates[0], cpiData)
		if startCPI > 0 {
			for i, date := range dates {
				dateCPI := findCPIForDate(date, cpiData)
				if dateCPI > 0 {
					curve[i].Value = vals[i] * (startCPI / dateCPI)
				}
			}
		}
	}

	return curve, allocHistory, nil
}

// sumFloat 求浮点切片之和。
func sumFloat(xs []float64) float64 {
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s
}

// buildPeriodicCashflowMap 将周期性现金流腿展开为 日期 -> 净金额 映射。
//
// 企业理由：与 Rust build_periodic_cashflow_map 对齐——按交易日步长（周 5/月 21/
// 季 63/年 252）推进，从首个步长处开始计入，withdrawal 取负，until 之后停止。
func buildPeriodicCashflowMap(legs []CashflowLeg, dates []string) map[string]float64 {
	m := make(map[string]float64)
	for _, leg := range legs {
		if leg.Amount == 0 {
			continue
		}
		amt := leg.Amount
		if leg.Type == "withdrawal" {
			amt = -amt
		}
		freqDays := 252
		switch leg.Frequency {
		case "weekly":
			freqDays = 5
		case "monthly":
			freqDays = 21
		case "quarterly":
			freqDays = 63
		case "yearly":
			freqDays = 252
		}
		until := leg.Until
		if until == "" {
			until = "9999-99-99"
		}
		nextIdx := 0
		for nextIdx < len(dates) {
			idx := nextIdx
			if idx+freqDays < len(dates) {
				nextIdx = idx + freqDays
			} else {
				break
			}
			if dates[nextIdx] > until {
				break
			}
			m[dates[nextIdx]] += amt
		}
	}
	return m
}

// findCPIForDate 查找给定日期对应的 CPI 值（月度数据）。
//
// 企业理由：与 Rust find_cpi_for_date 对齐——先精确匹配，再尝试同月 1 号，
// 最后逐日回溯最多 24 个月查找最近月份的 CPI 值。
func findCPIForDate(date string, cpiData map[string]float64) float64 {
	if v, ok := cpiData[date]; ok {
		return v
	}
	if len(date) < 7 {
		return 0
	}
	monthStart := date[:7] + "-01"
	if v, ok := cpiData[monthStart]; ok {
		return v
	}
	if d, err := time.Parse("2006-01-02", date); err == nil {
		search := d
		for k := 0; k < 24; k++ {
			search = search.AddDate(0, 0, -1)
			key := search.Format("2006-01") + "-01"
			if v, ok := cpiData[key]; ok {
				return v
			}
		}
	}
	return 0
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
