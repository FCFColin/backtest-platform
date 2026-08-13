package tactical

import (
	"cmp"
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"maps"
	"math"
	"slices"
)

func collectTickers(strategy TacticalStrategy) []string {
	set := make(map[string]bool)
	for _, sig := range strategy.Signals {
		for _, w := range sig.TargetWeights {
			set[w.Ticker] = true
		}
	}
	return slices.Sorted(maps.Keys(set))
}
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
func accumulateSignalWeights(activeSignals []TradingSignal, allTickers []string) map[string]float64 {
	acc := make(map[string]float64, len(allTickers))
	for _, sig := range activeSignals {
		for _, w := range normalizeWeights(sig.TargetWeights, allTickers) {
			acc[w.Ticker] += w.Weight
		}
	}
	return acc
}
func aggregateWeightedAverage(activeSignals []TradingSignal, allTickers []string) []WeightEntry {
	acc := accumulateSignalWeights(activeSignals, allTickers)
	total := 0.0
	for _, v := range acc {
		total += v
	}
	result := make([]WeightEntry, len(allTickers))
	for i, t := range allTickers {
		w := 1 / float64(len(allTickers))
		if total > 0 {
			w = acc[t] / total
		}
		result[i] = WeightEntry{Ticker: t, Weight: w}
	}
	return result
}
func aggregateRank(activeSignals []TradingSignal, allTickers []string, rc *RankingConfig) []WeightEntry {
	topN, method := 3, "fixed_share"
	if rc != nil {
		if rc.TopN > 0 {
			topN = rc.TopN
		}
		if rc.Method != "" {
			method = rc.Method
		}
	}
	score := accumulateSignalWeights(activeSignals, allTickers)
	type ts struct {
		ticker string
		score  float64
	}
	ranked := make([]ts, len(allTickers))
	for i, t := range allTickers {
		ranked[i] = ts{t, score[t]}
	}
	slices.SortFunc(ranked, func(a, b ts) int { return cmp.Compare(b.score, a.score) })
	ranked = ranked[:min(topN, len(ranked))]
	weights := make([]float64, len(ranked))
	if method == "risk_parity" {
		sumInv := 0.0
		for i, r := range ranked {
			if r.score > 0 {
				weights[i] = 1 / r.score
			} else {
				weights[i] = 1
			}
			sumInv += weights[i]
		}
		for i := range weights {
			weights[i] /= sumInv
		}
	} else {
		eq := 1 / float64(len(ranked))
		for i := range weights {
			weights[i] = eq
		}
	}
	result := make([]WeightEntry, len(ranked))
	for i, r := range ranked {
		result[i] = WeightEntry{Ticker: r.ticker, Weight: weights[i]}
	}
	return result
}

// aggregateVoting 投票聚合：每个活跃信号为其 TargetWeights 中的标的各投一票，
// 权重按票数比例归一（未获票的标的分摊 0）。
func aggregateVoting(activeSignals []TradingSignal, allTickers []string) []WeightEntry {
	votes := make(map[string]int, len(allTickers))
	for _, sig := range activeSignals {
		for _, w := range sig.TargetWeights {
			votes[w.Ticker]++
		}
	}
	entries := make([]WeightEntry, 0, len(votes))
	for t, v := range votes {
		entries = append(entries, WeightEntry{Ticker: t, Weight: float64(v)})
	}
	return normalizeWeights(entries, allTickers)
}

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
	case "voting":
		return aggregateVoting(activeSignals, allTickers)
	default:
		return normalizeWeights(activeSignals[0].TargetWeights, allTickers)
	}
}
func computeActiveFlags(strategy TacticalStrategy, priceData map[string]map[string]float64, dates []string, allTickers []string) map[string][]bool {
	activeFlags := make(map[string][]bool)
	for _, signal := range strategy.Signals {
		signalTicker := allTickers[0]
		for _, w := range signal.TargetWeights {
			if slices.Contains(allTickers, w.Ticker) {
				signalTicker = w.Ticker
				break
			}
		}
		priceMap := priceData[signalTicker]
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
			conditionFlags = append(conditionFlags, evaluateCondition(cond, computeIndicatorValue(cond.Indicator, filledPrices, cond.Period)))
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

func RunTacticalBacktest(ctx context.Context, req TacticalBacktestRequest) (*TacticalBacktestResult, error) {
	strategy := req.Strategy
	allTickers := collectTickers(strategy)
	if len(allTickers) == 0 && len(strategy.Signals) > 0 {
		return nil, engineutil.NewInputError("策略信号未配置任何标的")
	}
	activeFlags := computeActiveFlags(strategy, req.PriceData, req.Dates, allTickers)
	holdings := make(map[string]float64, len(allTickers))
	portfolioValue := req.StartingValue
	eq := 1 / float64(len(allTickers))
	for _, t := range allTickers {
		holdings[t] = portfolioValue * eq
	}
	var growthCurve []engine.DataPoint
	var signalHistory []SignalHistoryEntry
	prevDate, initialized := "", false
	for i, date := range req.Dates {
		if initialized {
			total := 0.0
			for _, t := range allTickers {
				pp := req.PriceData[t][prevDate]
				if pp > 0 {
					holdings[t] *= req.PriceData[t][date] / pp
				}
				total += holdings[t]
			}
			portfolioValue = total
		}
		if portfolioValue <= 0 {
			portfolioValue = 0
			for _, t := range allTickers {
				holdings[t] = 0
			}
			growthCurve = append(growthCurve, engine.DataPoint{Date: date, Value: 0})
			prevDate, initialized = date, true
			continue
		}
		if !initialized || engineutil.ShouldRebalance(req.RebalanceFrequency, prevDate, date, 0, nil, nil, 0, nil) {
			weights := aggregateSignals(strategy, activeFlags, i, allTickers)
			for t := range holdings {
				holdings[t] = 0
			}
			for _, w := range weights {
				holdings[w.Ticker] = portfolioValue * w.Weight
			}
			var names []string
			for _, sig := range strategy.Signals {
				if f, ok := activeFlags[sig.ID]; ok && i < len(f) && f[i] {
					names = append(names, sig.Name)
				}
			}
			rounded := make([]WeightEntry, len(weights))
			for j, w := range weights {
				rounded[j] = WeightEntry{Ticker: w.Ticker, Weight: math.Round(w.Weight*10000) / 10000}
			}
			signalHistory = append(signalHistory, SignalHistoryEntry{Date: date, ActiveSignals: names, Weights: rounded})
		}
		growthCurve = append(growthCurve, engine.DataPoint{Date: date, Value: portfolioValue})
		prevDate, initialized = date, true
	}
	stats := engine.Statistics{}
	if len(growthCurve) >= 2 {
		values := make([]float64, len(growthCurve))
		dts := make([]string, len(growthCurve))
		for i, g := range growthCurve {
			values[i], dts[i] = g.Value, g.Date
		}
		dailyRets := mathutil.DailyReturnsWithZeros(values)
		stats = engine.CalculateStatisticsFromRequest(engine.StatisticsRequest{Values: values, Dates: dts, StartingValue: req.StartingValue, DailyReturns: dailyRets, AnnualReturnValues: []float64{}, MonthlyReturnValues: []float64{}, MwrrCashflows: []engine.Cashflow{}})
	}
	return &TacticalBacktestResult{Portfolio: engine.PortfolioResult{Name: "战术分配", GrowthCurve: growthCurve, Statistics: stats}, SignalHistory: signalHistory}, nil
}
