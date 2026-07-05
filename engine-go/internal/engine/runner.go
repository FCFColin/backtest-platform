package engine

import (
	"fmt"
	"math"
	"sort"
	"time"
)

// RunBacktest 执行完整回测，是引擎的主入口函数。
func RunBacktest(req BacktestRequest) (*BacktestResult, error) {
	tradingDates, err := parseTradingDates(req.PriceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}

	tradingDates = filterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	if len(tradingDates) == 0 {
		return nil, fmt.Errorf("日期范围内无交易数据")
	}

	assetTickers := collectAssetTickers(req.PriceData)
	sort.Strings(assetTickers)

	portfolioResults := make([]PortfolioResult, 0, len(req.Portfolios))
	portfolioDailyReturns := make([][]float64, 0, len(req.Portfolios))

	for _, pf := range req.Portfolios {
		curve, allocHist, err := computeGrowthCurve(pf, req.PriceData, req.CPIData, req.ExchangeRates, tradingDates, req.Params)
		if err != nil {
			return nil, fmt.Errorf("组合 %s 计算失败: %w", pf.Name, err)
		}

		ddCurve := computeDrawdownCurve(curve)
		episodes := detectDrawdownEpisodes(curve)

		var benchCurve []DataPoint
		if req.Params.BenchmarkTicker != "" {
			benchCurve = computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, req.ExchangeRates, tradingDates, req.Params)
		}

		stats := computeStatistics(curve, ddCurve, episodes, benchCurve)
		rollingReturns := computeRollingReturns(curve, req.Params.RollingWindowMonths)
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

	correlations := computeCorrelationMatrix(portfolioDailyReturns)

	var benchmarkGrowth []DataPoint
	if req.Params.BenchmarkTicker != "" {
		benchmarkGrowth = computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, req.ExchangeRates, tradingDates, req.Params)
	}

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

// computeGrowthCurve 计算组合增长曲线，是回测的核心算法。
//
// 逐日迭代：每天根据各资产价格更新持有份额，处理再平衡、拖累、汇率换算、
// 现金流、glidepath 与通胀调整等操作。
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

	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates {
		dates[i] = d.Format("2006-01-02")
	}
	if len(dates) == 0 {
		return nil, nil, fmt.Errorf("组合 %s 日期范围内无数据", pf.Name)
	}

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

	dailyDrag := 1.0
	if pf.Drag > 0 {
		dailyDrag = math.Pow(1.0-pf.Drag/100.0, 1.0/float64(tradingDays))
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

		if dailyDrag != 1.0 {
			for i := range holdings {
				holdings[i] *= dailyDrag
			}
			pv = sumFloat(holdings)
		}

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
