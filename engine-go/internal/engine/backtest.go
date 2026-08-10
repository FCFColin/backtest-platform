package engine

import (
	"context"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"fmt"
	"maps"
	"math"
	"slices"
	"time"
)

func RunBacktest(ctx context.Context, req BacktestRequest) (*BacktestResult, error) {
	tradingDates, err := engineutil.ParseTradingDates(req.PriceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}
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
		stats := computeStatistics(curve, episodes, benchmarkGrowth, mwrrCashflows)
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
	result := &BacktestResult{Portfolios: portfolioResults, Correlations: correlations, BenchmarkGrowth: benchmarkGrowth, AssetTickers: assetTickers, AssetCorrelations: assetCorrelations}
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
			mwrrCashflows = append(mwrrCashflows, Cashflow{Value: cfAmount, Time: float64(di) / tradingDaysPerYear})
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
		if di > 0 && engineutil.ShouldRebalance(pf.RebalanceFrequency, prev, date, pf.RebalanceThreshold, holdings, currentWeights, pv, pf.RebalanceBands) {
			recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
			lastRebalanceDi = di
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

func computeStatistics(curve []DataPoint, episodes []DrawdownEpisode, benchCurve []DataPoint, mwrrCashflows []Cashflow) Statistics {
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
		benchDailyReturns = mathutil.DailyReturns(extractValues(benchCurve))
		c := CalcCAGR(benchCurve[0].Value, benchCurve[len(benchCurve)-1].Value, float64(len(benchCurve))/tradingDaysPerYear)
		benchmarkCagr = &c
	}
	result := CalculateStatisticsFromRequest(StatisticsRequest{Values: values, Dates: dates, StartingValue: startValue, DailyReturns: mathutil.DailyReturns(values), AnnualReturnValues: annualReturnValues, MonthlyReturnValues: monthlyReturnValues, MwrrCashflows: mwrrCashflows, BenchmarkDailyReturns: benchDailyReturns, BenchmarkCagr: benchmarkCagr})
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
func monthlyReturnsFromCurve(curve []DataPoint) []MonthlyReturn {
	if len(curve) < 2 {
		return nil
	}
	return CalcMonthlyReturns(extractValues(curve), extractDates(curve))
}
