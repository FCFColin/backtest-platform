package tactical

import (
	"context"
	"math"
	"sort"

	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
)

// evaluateCondition 评估信号条件。
func evaluateCondition(cond SignalCondition, values []*float64) []bool {
	result := make([]bool, len(values))
	for i, val := range values {
		if val == nil {
			result[i] = false
			continue
		}
		var prev *float64
		if i > 0 {
			prev = values[i-1]
		}
		switch cond.Operator {
		case "gt":
			result[i] = *val > cond.Threshold
		case "lt":
			result[i] = *val < cond.Threshold
		case "cross_above":
			result[i] = *val > cond.Threshold && prev != nil && *prev <= cond.Threshold
		case "cross_below":
			result[i] = *val < cond.Threshold && prev != nil && *prev >= cond.Threshold
		default:
			result[i] = false
		}
	}
	return result
}

// collectTickers 收集策略中所有涉及的 ticker。
func collectTickers(strategy TacticalStrategy) []string {
	set := make(map[string]bool)
	for _, sig := range strategy.Signals {
		for _, w := range sig.TargetWeights {
			set[w.Ticker] = true
		}
	}
	var result []string
	for t := range set {
		result = append(result, t)
	}
	sort.Strings(result)
	return result
}

// normalizeWeights 归一化权重。
// 归一化逻辑委托至 engineutil.NormalizeWeights（spec Wave 4 Task 4.1：消除与
// engine 包的重复实现），本函数仅负责 WeightEntry/tickers → []float64 的映射适配。
func normalizeWeights(weights []WeightEntry, tickers []string) []WeightEntry {
	m := make(map[string]float64)
	for _, w := range weights {
		m[w.Ticker] = w.Weight
	}
	raw := make([]float64, len(tickers))
	for i, t := range tickers {
		raw[i] = m[t]
	}
	normalized := engineutil.NormalizeWeights(raw)
	result := make([]WeightEntry, len(tickers))
	for i, t := range tickers {
		result[i] = WeightEntry{Ticker: t, Weight: normalized[i]}
	}
	return result
}

// aggregateWeightedAverage 加权平均聚合。
func aggregateWeightedAverage(activeSignals []TradingSignal, allTickers []string) []WeightEntry {
	acc := make(map[string]float64)
	for _, t := range allTickers {
		acc[t] = 0
	}
	for _, sig := range activeSignals {
		norm := normalizeWeights(sig.TargetWeights, allTickers)
		for _, w := range norm {
			acc[w.Ticker] += w.Weight
		}
	}
	total := 0.0
	for _, v := range acc {
		total += v
	}
	result := make([]WeightEntry, len(allTickers))
	for i, t := range allTickers {
		if total > 0 {
			result[i] = WeightEntry{Ticker: t, Weight: acc[t] / total}
		} else {
			result[i] = WeightEntry{Ticker: t, Weight: 1 / float64(len(allTickers))}
		}
	}
	return result
}

// aggregateRank 排名聚合。
func aggregateRank(activeSignals []TradingSignal, allTickers []string, rankingConfig *RankingConfig) []WeightEntry {
	topN := 3
	if rankingConfig != nil && rankingConfig.TopN > 0 {
		topN = rankingConfig.TopN
	}
	method := "fixed_share"
	if rankingConfig != nil && rankingConfig.Method != "" {
		method = rankingConfig.Method
	}
	score := make(map[string]float64)
	for _, t := range allTickers {
		score[t] = 0
	}
	for _, sig := range activeSignals {
		norm := normalizeWeights(sig.TargetWeights, allTickers)
		for _, w := range norm {
			score[w.Ticker] += w.Weight
		}
	}
	type tickerScore struct {
		ticker string
		score  float64
	}
	var ranked []tickerScore
	for _, t := range allTickers {
		ranked = append(ranked, tickerScore{ticker: t, score: score[t]})
	}
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score
	})
	if topN > len(ranked) {
		topN = len(ranked)
	}
	ranked = ranked[:topN]
	if method == "risk_parity" {
		inv := make([]float64, len(ranked))
		sumInv := 0.0
		for i, r := range ranked {
			if r.score > 0 {
				inv[i] = 1 / r.score
			} else {
				inv[i] = 1
			}
			sumInv += inv[i]
		}
		result := make([]WeightEntry, len(ranked))
		for i, r := range ranked {
			result[i] = WeightEntry{Ticker: r.ticker, Weight: inv[i] / sumInv}
		}
		return result
	}
	result := make([]WeightEntry, len(ranked))
	for i, r := range ranked {
		result[i] = WeightEntry{Ticker: r.ticker, Weight: 1 / float64(len(ranked))}
	}
	return result
}

// aggregateSignals 聚合多信号生成目标权重。
func aggregateSignals(strategy TacticalStrategy, activeFlags map[string][]bool, dateIdx int, allTickers []string) []WeightEntry {
	var activeSignals []TradingSignal
	for _, sig := range strategy.Signals {
		if flags, ok := activeFlags[sig.ID]; ok && dateIdx < len(flags) && flags[dateIdx] {
			activeSignals = append(activeSignals, sig)
		}
	}
	if len(activeSignals) == 0 {
		result := make([]WeightEntry, len(allTickers))
		for i, t := range allTickers {
			result[i] = WeightEntry{Ticker: t, Weight: 1 / float64(len(allTickers))}
		}
		return result
	}
	switch strategy.AggregationMethod {
	case "weighted_average":
		return aggregateWeightedAverage(activeSignals, allTickers)
	case "rank":
		return aggregateRank(activeSignals, allTickers, strategy.RankingConfig)
	default:
		return normalizeWeights(activeSignals[0].TargetWeights, allTickers)
	}
}

// computeActiveFlags 计算每个信号在各日期是否激活。
func computeActiveFlags(strategy TacticalStrategy, priceData map[string]map[string]float64, dates []string, allTickers []string) map[string][]bool {
	activeFlags := make(map[string][]bool)
	for _, signal := range strategy.Signals {
		signalTicker := allTickers[0]
		for _, w := range signal.TargetWeights {
			for _, t := range allTickers {
				if w.Ticker == t {
					signalTicker = t
					break
				}
			}
		}
		priceMap := priceData[signalTicker]
		if priceMap == nil {
			priceMap = make(map[string]float64)
		}
		lastValid := 0.0
		filledPrices := make([]float64, len(dates))
		for i, d := range dates {
			if p, ok := priceMap[d]; ok {
				lastValid = p
			}
			filledPrices[i] = lastValid
		}
		var conditionFlags [][]bool
		for _, cond := range signal.Conditions {
			values := computeIndicatorValue(cond.Indicator, filledPrices, cond.Period)
			conditionFlags = append(conditionFlags, evaluateCondition(cond, values))
		}
		combined := make([]bool, len(dates))
		for i := 0; i < len(dates); i++ {
			all := true
			for _, f := range conditionFlags {
				if !f[i] {
					all = false
					break
				}
			}
			combined[i] = all
		}
		activeFlags[signal.ID] = combined
	}
	return activeFlags
}

// RunTacticalBacktest 执行战术分配回测。
func RunTacticalBacktest(ctx context.Context, req TacticalBacktestRequest) (*TacticalBacktestResult, error) {
	strategy := req.Strategy
	priceData := req.PriceData
	dates := req.Dates
	startingValue := req.StartingValue
	rebalanceFreq := req.RebalanceFrequency

	allTickers := collectTickers(strategy)
	activeFlags := computeActiveFlags(strategy, priceData, dates, allTickers)

	var growthCurve []engine.DataPoint
	var signalHistory []SignalHistoryEntry
	portfolioValue := startingValue
	holdings := make(map[string]float64)
	currentWeights := make([]WeightEntry, len(allTickers))
	for i, t := range allTickers {
		currentWeights[i] = WeightEntry{Ticker: t, Weight: 1 / float64(len(allTickers))}
	}
	for _, w := range currentWeights {
		holdings[w.Ticker] = portfolioValue * w.Weight
	}
	prevDate := ""
	initialized := false

	for i, date := range dates {
		if initialized {
			total := 0.0
			for _, ticker := range allTickers {
				priceToday := priceData[ticker][date]
				pricePrev := priceData[ticker][prevDate]
				if pricePrev > 0 {
					holdings[ticker] = holdings[ticker] * (priceToday / pricePrev)
				}
				total += holdings[ticker]
			}
			portfolioValue = total
		}

		if portfolioValue <= 0 {
			portfolioValue = 0
			for _, t := range allTickers {
				holdings[t] = 0
			}
			growthCurve = append(growthCurve, engine.DataPoint{Date: date, Value: 0})
			prevDate = date
			initialized = true
			continue
		}

		// engineutil.ShouldRebalance 参数顺序为 (frequency, prevDate, currDate, ...)，
		// tactical 此前仅按频率触发，故 threshold/bands 全部传零值以保持等价语义。
		if !initialized || engineutil.ShouldRebalance(rebalanceFreq, prevDate, date, 0, nil, nil, 0, nil) {
			currentWeights = aggregateSignals(strategy, activeFlags, i, allTickers)
			for _, w := range currentWeights {
				holdings[w.Ticker] = portfolioValue * w.Weight
			}
			var activeSignalNames []string
			for _, sig := range strategy.Signals {
				if flags, ok := activeFlags[sig.ID]; ok && i < len(flags) && flags[i] {
					activeSignalNames = append(activeSignalNames, sig.Name)
				}
			}
			roundedWeights := make([]WeightEntry, len(currentWeights))
			for j, w := range currentWeights {
				roundedWeights[j] = WeightEntry{Ticker: w.Ticker, Weight: math.Round(w.Weight*10000) / 10000}
			}
			signalHistory = append(signalHistory, SignalHistoryEntry{
				Date:          date,
				ActiveSignals: activeSignalNames,
				Weights:       roundedWeights,
			})
		}

		growthCurve = append(growthCurve, engine.DataPoint{Date: date, Value: portfolioValue})
		prevDate = date
		initialized = true
	}

	// 计算统计指标——直接调用 engine 包，无需 HTTP 自调用
	stats := computeSimpleStats(growthCurve, startingValue)

	result := &TacticalBacktestResult{
		Portfolio: engine.PortfolioResult{
			Name:        "战术分配",
			GrowthCurve: growthCurve,
			Statistics:  stats,
		},
		SignalHistory: signalHistory,
	}
	return result, nil
}

// computeSimpleStats 从增长曲线计算简化统计指标。
func computeSimpleStats(growthCurve []engine.DataPoint, startingValue float64) engine.Statistics {
	if len(growthCurve) < 2 {
		return engine.Statistics{}
	}
	values := make([]float64, len(growthCurve))
	dates := make([]string, len(growthCurve))
	for i, g := range growthCurve {
		values[i] = g.Value
		dates[i] = g.Date
	}
	dailyReturns := make([]float64, 0, len(values)-1)
	for i := 1; i < len(values); i++ {
		if values[i-1] > 0 {
			dailyReturns = append(dailyReturns, (values[i]-values[i-1])/values[i-1])
		} else {
			dailyReturns = append(dailyReturns, 0)
		}
	}
	statReq := engine.StatisticsRequest{
		Values:           values,
		Dates:            dates,
		StartingValue:    startingValue,
		DailyReturns:      dailyReturns,
		AnnualReturnValues:  []float64{},
		MonthlyReturnValues: []float64{},
		MwrrCashflows:      []engine.Cashflow{},
	}
	return engine.CalculateStatisticsFromRequest(statReq)
}
