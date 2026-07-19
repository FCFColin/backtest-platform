package engine

import (
	"fmt"
	"math"
	"time"

	"engine-go/internal/engineutil"
)

// computeGrowthCurve 计算组合增长曲线——回测的核心算法
//
// 企业理由：逐日迭代是回测引擎的核心。每天根据各资产价格更新持有份额，
// 处理再平衡、拖累（drag）、汇率换算、现金流、glidepath 与通胀调整等操作。
//
// ADR-008：本实现为 Go 引擎净值生成逻辑，
// 涵盖复利拖累 (1-drag/100)^(1/252)、汇率换算（含回溯查找）、CPI 通胀调整、
// 定期/一次性现金流、glidepath 线性插值、再平衡偏离带与清算处理。
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

	weights := normalizeWeights(pf.Assets)

	// 交易日序列（字符串），来源于已按日期范围过滤的 tradingDates。
	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates {
		dates[i] = d.Format("2006-01-02")
	}
	if len(dates) == 0 {
		return nil, nil, fmt.Errorf("组合 %s 日期范围内无数据", pf.Name)
	}

	gp := func(ticker, date string) float64 {
		return getPriceWithFX(ticker, date, priceData, exchangeRates)
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
	cfMap, err := buildPeriodicCashflowMap(params.CashflowLegs, dates)
	if err != nil {
		return nil, nil, err
	}

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

		currentWeights := glidepathWeights(weights, glidepathTo, di, glidepathYears)

		// 现金流（周期性 + 一次性）
		cfAmount := cfMap[date] + otcMap[date]
		if cfAmount != 0 {
			pv += cfAmount
			if pv <= 0 {
				liquidated = true
				zeroHoldings(holdings)
				curve = append(curve, DataPoint{Date: date, Value: 0})
				vals = append(vals, 0)
				prev = date
				continue
			}
			recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
		}

		if pv <= 0 {
			liquidated = true
			zeroHoldings(holdings)
			curve = append(curve, DataPoint{Date: date, Value: 0})
			vals = append(vals, 0)
			prev = date
			continue
		}

		if di > 0 && engineutil.ShouldRebalance(pf.RebalanceFrequency, prev, date, pf.RebalanceThreshold, holdings, currentWeights, pv, pf.RebalanceBands) {
			recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
			lastRebalanceDi = di
		}

		curve = append(curve, DataPoint{Date: date, Value: pv})
		vals = append(vals, pv)

		// 权重快照：每 20 个交易日或调仓日记录一次。
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

	return curve, allocHistory, nil
}

// recalculateShares 根据目标权重和当前价格重新计算持仓和份额。
func recalculateShares(holdings []float64, shares *[]float64, lastPrices []float64, currentWeights []float64, pv float64, pf PortfolioInput, gp func(string, string) float64, date string) {
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
			(*shares)[i] = holdings[i] / eff
		} else {
			(*shares)[i] = 0
		}
	}
}

// zeroHoldings 将所有持仓清零。
func zeroHoldings(holdings []float64) {
	for i := range holdings {
		holdings[i] = 0
	}
}
