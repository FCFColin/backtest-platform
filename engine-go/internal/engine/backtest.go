package engine

import (
	"context"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"fmt"
	"maps"
	"math"
	"slices"
	"sort"
	"time"
)

func RunBacktest(ctx context.Context, req BacktestRequest) (*BacktestResult, error) {
	tradingDates := engineutil.ParseTradingDates(req.PriceData)
	tradingDates = engineutil.FilterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	if len(tradingDates) == 0 {
		return nil, engineutil.NewInputError("日期范围内无交易数据")
	}
	assetTickers := slices.Sorted(maps.Keys(req.PriceData))
	benchmarkGrowth := computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, tradingDates, req.Params)
	portfolioResults := make([]PortfolioResult, 0, len(req.Portfolios))
	portfolioDailyReturns := make([][]float64, 0, len(req.Portfolios))
	for _, pf := range req.Portfolios {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		curve, allocHist, mwrrCashflows, err := computeGrowthCurve(pf, req.PriceData, req.CPIData, req.ExchangeRates, tradingDates, req.Params)
		if err != nil {
			return nil, fmt.Errorf("组合 %s 计算失败: %w", pf.Name, err)
		}
		ddCurve := CalcDrawdownCurve(extractValues(curve), extractDates(curve))
		episodes := detectDrawdownEpisodes(curve)
		stats := computeStatistics(curve, episodes, benchmarkGrowth, mwrrCashflows, req.Params.RiskFreeRate)
		if len(pf.Assets) > 0 {
			weights := normalizeWeights(pf.Assets)
			assetRets := make([][]float64, len(pf.Assets))
			for i, a := range pf.Assets {
				assetRets[i] = mathutil.DailyReturns(engineutil.ExtractPrices(req.PriceData, a.Ticker, tradingDates))
			}
			stats.DiversificationRatio = CalcDiversificationRatio(weights, assetRets, mathutil.DailyReturns(extractValues(curve)))
		}
		rollingReturns := CalcRollingReturns(extractValues(curve), extractDates(curve), req.Params.RollingWindowMonths)
		portfolioResults = append(portfolioResults, PortfolioResult{Name: pf.Name, GrowthCurve: curve, DrawdownCurve: ddCurve, RollingReturns: rollingReturns, AnnualReturns: annualReturnsFromCurve(curve), MonthlyReturns: monthlyReturnsFromCurve(curve), Statistics: stats, DrawdownEpisodes: episodes, AllocationHistory: allocHist})
		portfolioDailyReturns = append(portfolioDailyReturns, mathutil.DailyReturns(extractValues(curve)))
	}
	correlations := CalcCorrelationMatrix(portfolioDailyReturns)
	assetDailyReturns := make([][]float64, 0, len(assetTickers))
	for _, ticker := range assetTickers {
		assetDailyReturns = append(assetDailyReturns, mathutil.DailyReturns(engineutil.ExtractPrices(req.PriceData, ticker, tradingDates)))
	}
	assetCorrelations := CalcCorrelationMatrix(assetDailyReturns)
	quarterlyCorrelations := ComputeQuarterlyCorrelationMatrices(assetTickers, assetDailyReturns, tradingDates[1:]) // rets[i] 属于 dates[i+1]，对齐后传
	result := &BacktestResult{Portfolios: portfolioResults, Correlations: correlations, BenchmarkGrowth: benchmarkGrowth, AssetTickers: assetTickers, AssetCorrelations: assetCorrelations, QuarterlyCorrelations: quarterlyCorrelations}
	return result, nil
}

func computeBenchmarkGrowth(benchmarkTicker string, priceData PriceDataMap, tradingDates []time.Time, params BacktestParams) []DataPoint {
	startValue := engineutil.DefaultStartingValue(params.StartingValue)
	tickerData, ok := priceData[benchmarkTicker]
	if !ok {
		return nil
	}
	prices := make([]float64, len(tradingDates))
	last, firstIdx := 0.0, -1
	for i, d := range tradingDates {
		if p, exists := tickerData[d.Format("2006-01-02")]; exists {
			last = p
			if firstIdx < 0 {
				firstIdx = i
			}
		}
		prices[i] = last
	}
	if firstIdx < 0 {
		return nil
	}
	startPrice := prices[firstIdx]
	curve := make([]DataPoint, len(prices))
	for i, p := range prices {
		curve[i] = DataPoint{Date: tradingDates[i].Format("2006-01-02"), Value: startValue * (p / startPrice)}
	}
	return curve
}

func computeGrowthCurve(pf PortfolioInput, priceData PriceDataMap, cpiData map[string]float64, exchangeRates map[string]float64, tradingDates []time.Time, params BacktestParams) ([]DataPoint, []AllocationPoint, []Cashflow, error) {
	startValue := engineutil.DefaultStartingValue(params.StartingValue)
	n := len(pf.Assets)
	if n == 0 {
		return nil, nil, nil, engineutil.NewInputError("组合 %s 无资产", pf.Name)
	}
	weights := normalizeWeights(pf.Assets)
	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates {
		dates[i] = d.Format("2006-01-02")
	}
	gp := func(ticker, date string) float64 { return getPriceWithFX(ticker, date, priceData, exchangeRates) }
	holdings := make([]float64, n)
	for i := range holdings {
		holdings[i] = startValue * weights[i]
	}
	initPrices := make([]float64, n)
	shares := make([]float64, n)
	for i, a := range pf.Assets {
		initPrices[i] = gp(a.Ticker, dates[0])
		if initPrices[i] > 0 {
			shares[i] = holdings[i] / initPrices[i]
		}
	}
	lastPrices := make([]float64, n)
	dailyDrag := 1.0
	if pf.Drag > 0 {
		dailyDrag = math.Pow(1.0-pf.Drag/100.0, 1.0/tradingDaysPerYear)
	}
	var glidepathTo []float64
	if len(pf.GlidepathToWeights) == n {
		glidepathTo = pf.GlidepathToWeights
	}
	glidepathYears := float64(pf.GlidepathYears)
	if glidepathYears == 0 {
		glidepathYears = 10
	}
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
	cfMap, err := buildPeriodicCashflowMap(params.CashflowLegs, dates)
	if err != nil {
		return nil, nil, nil, err
	}
	curve := make([]DataPoint, 0, len(dates))
	allocHistory := make([]AllocationPoint, 0)
	vals := make([]float64, 0, len(dates))
	mwrrCashflows := []Cashflow{{Value: -startValue, Time: 0}}
	liquidated := false
	prev := dates[0]
	lastRebalanceDi := 0
	rebalanceIn := -1
	for di, date := range dates {
		if liquidated {
			curve, vals = appendZeroDay(curve, vals, date)
			prev = date
			continue
		}
		updatePrices(pf, gp, date, lastPrices)
		pv := 0.0
		for i := range holdings {
			if lastPrices[i] > 0 {
				if shares[i] == 0 && holdings[i] > 0 {
					shares[i] = holdings[i] / lastPrices[i]
				}
				holdings[i] = shares[i] * lastPrices[i]
			}
			if dailyDrag != 1.0 {
				holdings[i] *= dailyDrag
			}
			pv += holdings[i]
		}
		currentWeights := glidepathWeights(weights, glidepathTo, di, glidepathYears)
		cfAmount := cfMap[date] + otcMap[date]
		if cfAmount != 0 {
			// 投入为负、回收为正（CalcMWRR IRR 约定，statistics_test.go TestCalcMWRR）
			mwrrCashflows = append(mwrrCashflows, Cashflow{Value: -cfAmount, Time: float64(di) / tradingDaysPerYear})
			pv += cfAmount
			if pv > 0 {
				recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
			}
		}
		if pv <= 0 {
			liquidated = true
			zeroHoldings(holdings)
			curve, vals = appendZeroDay(curve, vals, date)
			prev = date
			continue
		}
		if di > 0 && rebalanceIn > 0 {
			rebalanceIn--
			if rebalanceIn == 0 {
				recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
				lastRebalanceDi = di
				rebalanceIn = -1 // 复位，恢复周期再平衡（否则 offset 首次触发后永久停摆）
			}
		} else if di > 0 && rebalanceIn < 0 && engineutil.ShouldRebalance(pf.RebalanceFrequency, prev, date, pf.RebalanceThreshold, holdings, currentWeights, pv, pf.RebalanceBands) {
			if pf.RebalanceOffset > 0 {
				rebalanceIn = pf.RebalanceOffset
			} else {
				recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
				lastRebalanceDi = di
			}
		}
		curve = append(curve, DataPoint{Date: date, Value: pv})
		vals = append(vals, pv)
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
	adjustForInflation(curve, vals, dates, cpiData, params.AdjustForInflation)
	return curve, allocHistory, mwrrCashflows, nil
}

func updatePrices(pf PortfolioInput, gp func(string, string) float64, date string, lastPrices []float64) {
	for i, a := range pf.Assets {
		if pr := gp(a.Ticker, date); pr > 0 {
			lastPrices[i] = pr
		}
	}
}
func recalculateShares(holdings []float64, shares *[]float64, lastPrices []float64, currentWeights []float64, pv float64, pf PortfolioInput, gp func(string, string) float64, date string) {
	for i := range holdings {
		holdings[i] = pv * currentWeights[i]
	}
	updatePrices(pf, gp, date, lastPrices)
	for i := range holdings {
		if lastPrices[i] > 0 {
			(*shares)[i] = holdings[i] / lastPrices[i]
		} else {
			(*shares)[i] = 0
		}
	}
}
func appendZeroDay(curve []DataPoint, vals []float64, date string) ([]DataPoint, []float64) {
	return append(curve, DataPoint{Date: date, Value: 0}), append(vals, 0)
}
func zeroHoldings(holdings []float64) { clear(holdings) }

func computeStatistics(curve []DataPoint, episodes []DrawdownEpisode, benchCurve []DataPoint, mwrrCashflows []Cashflow, riskFreeRate *float64) Statistics {
	if len(curve) < 2 {
		return Statistics{}
	}
	values := extractValues(curve)
	dates := extractDates(curve)
	startValue := curve[0].Value
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
	var benchDailyReturns []float64
	var benchmarkCagr *float64
	if len(benchCurve) >= 2 {
		benchValues := extractValues(benchCurve)
		// 用固定长度版本使基准日收益与组合日收益按日期位置对齐（前置缺口日记 0 而非跳过，
		// 否则 alignPair 按索引截断会把不同日期的收益错配）。
		benchDailyReturns = mathutil.DailyReturnsWithZeros(benchValues)
		startIdx := 0
		for startIdx < len(benchValues)-1 && benchValues[startIdx] <= 0 {
			startIdx++
		}
		if benchValues[startIdx] > 0 {
			c := CalcCAGR(benchValues[startIdx], benchValues[len(benchValues)-1], float64(len(benchValues)-startIdx)/tradingDaysPerYear)
			benchmarkCagr = &c
		}
	}
	result := CalculateStatisticsFromRequest(StatisticsRequest{Values: values, Dates: dates, StartingValue: startValue, DailyReturns: mathutil.DailyReturns(values), AnnualReturnValues: annualReturnValues, MonthlyReturnValues: monthlyReturnValues, MwrrCashflows: mwrrCashflows, BenchmarkDailyReturns: benchDailyReturns, BenchmarkCagr: benchmarkCagr, RiskFreeRate: riskFreeRate})
	return result
}
func CalcCorrelationMatrix(dailyReturnsList [][]float64) [][]float64 {
	n := len(dailyReturnsList)
	matrix := make([][]float64, n)
	for i := range matrix {
		matrix[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := i; j < n; j++ {
			if i == j {
				matrix[i][j] = 1
			} else {
				matrix[i][j] = CalcCorrelation(dailyReturnsList[i], dailyReturnsList[j])
				matrix[j][i] = matrix[i][j]
			}
		}
	}
	return matrix
}
func annualReturnsFromCurve(curve []DataPoint) []AnnualReturn {
	if len(curve) < 2 {
		return nil
	}
	return CalcAnnualReturns(extractValues(curve), extractDates(curve))
}

// ComputeQuarterlyCorrelationMatrices 按自然季度切片计算资产相关矩阵序列（AWALYT 对标）。
// 观测数 <2 的季度跳过；矩阵维度与 tickers 全集一致。
// 观测数 <2 的季度跳过；矩阵维度与 tickers 全集一致（缺失观测日以该季可用行对齐——
// 简化口径：仅统计该季度内所有资产均有收益的索引子集）。
func ComputeQuarterlyCorrelationMatrices(tickers []string, assetDailyReturns [][]float64, tradingDates []time.Time) []QuarterlyCorrelationMatrix {
	if len(assetDailyReturns) == 0 || len(tradingDates) == 0 {
		return nil
	}
	type bucket struct {
		key  string
		rows []int
	}
	buckets := make(map[string]*bucket)
	for di := range tradingDates {
		q := (int(tradingDates[di].Month())-1)/3 + 1
		key := fmt.Sprintf("%dQ%d", tradingDates[di].Year(), q)
		b, ok := buckets[key]
		if !ok {
			b = &bucket{key: key}
			buckets[key] = b
		}
		b.rows = append(b.rows, di)
	}
	keys := make([]string, 0, len(buckets))
	for k := range buckets {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]QuarterlyCorrelationMatrix, 0, len(keys))
	for _, k := range keys {
		rows := buckets[k].rows
		if len(rows) < 2 {
			continue
		}
		sliced := make([][]float64, len(assetDailyReturns))
		valid := true
		for ai, rets := range assetDailyReturns {
			sub := make([]float64, len(rows))
			for ri, di := range rows {
				if di >= len(rets) {
					valid = false
					break
				}
				sub[ri] = rets[di]
			}
			if !valid {
				break
			}
			sliced[ai] = sub
		}
		if !valid {
			continue
		}
		out = append(out, QuarterlyCorrelationMatrix{
			Quarter: k,
			Matrix:  CalcCorrelationMatrix(sliced),
			Tickers: append([]string(nil), tickers...),
		})
	}
	return out
}
func monthlyReturnsFromCurve(curve []DataPoint) []MonthlyReturn {
	if len(curve) < 2 {
		return nil
	}
	return CalcMonthlyReturns(extractValues(curve), extractDates(curve))
}
