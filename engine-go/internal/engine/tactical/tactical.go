// Package tactical 提供战术分配回测和网格搜索功能。
package tactical

import (
	"cmp"
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/indicators"
	"math"
	"slices"
	"strconv"
	"strings"
)

const tradingDaysPerYear = engineutil.TradingDaysPerYear

type TechnicalIndicator string

const (
	IndSMA       TechnicalIndicator = "sma"
	IndEMA       TechnicalIndicator = "ema"
	IndRSI       TechnicalIndicator = "rsi"
	IndMACD      TechnicalIndicator = "macd"
	IndBollinger TechnicalIndicator = "bollinger"
	IndMomentum  TechnicalIndicator = "momentum"
)

type SignalCondition struct {
	Indicator TechnicalIndicator `json:"indicator"`
	Period    int                `json:"period"`
	Operator  string             `json:"operator"`
	Threshold float64            `json:"threshold"`
}
type WeightEntry struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type TradingSignal struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Conditions    []SignalCondition `json:"conditions"`
	TargetWeights []WeightEntry     `json:"targetWeights"`
}
type RankingConfig struct {
	Method string `json:"method"`
	TopN   int    `json:"topN"`
}
type TacticalStrategy struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	Signals           []TradingSignal `json:"signals"`
	AggregationMethod string          `json:"aggregationMethod"`
	RankingConfig     *RankingConfig  `json:"rankingConfig,omitempty"`
}
type SignalHistoryEntry struct {
	Date          string        `json:"date"`
	ActiveSignals []string      `json:"activeSignals"`
	Weights       []WeightEntry `json:"weights"`
}
type TacticalBacktestRequest struct {
	Strategy           TacticalStrategy              `json:"strategy"`
	PriceData          map[string]map[string]float64 `json:"priceData"`
	Dates              []string                      `json:"dates"`
	StartingValue      float64                       `json:"startingValue"`
	RebalanceFrequency string                        `json:"rebalanceFrequency"`
}
type TacticalBacktestResult struct {
	Portfolio     engine.PortfolioResult `json:"portfolio"`
	SignalHistory []SignalHistoryEntry   `json:"signalHistory"`
}
type ParamRange struct {
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}
type GridCombinationMetrics struct {
	Param1      float64 `json:"param1"`
	Param2      float64 `json:"param2"`
	CAGR        float64 `json:"cagr"`
	MaxDrawdown float64 `json:"maxDrawdown"`
	Sharpe      float64 `json:"sharpe"`
	TotalReturn float64 `json:"totalReturn"`
	Stdev       float64 `json:"stdev"`
	Calmar      float64 `json:"calmar"`
}
type TopCombinationResult struct {
	GridCombinationMetrics
	GrowthCurve []engine.DataPoint `json:"growthCurve"`
}
type HeatmapData struct {
	Param1Label  string       `json:"param1Label"`
	Param2Label  string       `json:"param2Label"`
	Param1Values []float64    `json:"param1Values"`
	Param2Values []float64    `json:"param2Values"`
	Matrix       [][]*float64 `json:"matrix"`
	Objective    string       `json:"objective"`
}
type TacticalGridRequest struct {
	Indicator          string                        `json:"indicator"`
	Param1             ParamRange                    `json:"param1"`
	Param2             ParamRange                    `json:"param2"`
	PriceData          map[string]map[string]float64 `json:"priceData"`
	Dates              []string                      `json:"dates"`
	Prices             []float64                     `json:"prices"`
	TradingTicker      string                        `json:"tradingTicker"`
	StartDate          string                        `json:"startDate"`
	EndDate            string                        `json:"endDate"`
	StartingValue      float64                       `json:"startingValue"`
	RebalanceFrequency string                        `json:"rebalanceFrequency"`
	Objective          string                        `json:"objective"`
	TopN               *int                          `json:"topN,omitempty"`
}
type TacticalGridResponse struct {
	TotalCombinations int                      `json:"totalCombinations"`
	AllMetrics        []GridCombinationMetrics `json:"allMetrics"`
	TopResults        []TopCombinationResult   `json:"topResults"`
	Heatmap           HeatmapData              `json:"heatmap"`
	BestCombination   *TopCombinationResult    `json:"bestCombination"`
}

func evaluateCondition(cond SignalCondition, values []*float64) []bool {
	result := make([]bool, len(values))
	for i, val := range values {
		if val == nil {
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
		}
	}
	return result
}
func collectTickers(strategy TacticalStrategy) []string {
	set := make(map[string]bool)
	for _, sig := range strategy.Signals {
		for _, w := range sig.TargetWeights {
			set[w.Ticker] = true
		}
	}
	result := make([]string, 0, len(set))
	for t := range set {
		result = append(result, t)
	}
	slices.Sort(result)
	return result
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
func aggregateWeightedAverage(activeSignals []TradingSignal, allTickers []string) []WeightEntry {
	acc := make(map[string]float64, len(allTickers))
	for _, t := range allTickers {
		acc[t] = 0
	}
	for _, sig := range activeSignals {
		for _, w := range normalizeWeights(sig.TargetWeights, allTickers) {
			acc[w.Ticker] += w.Weight
		}
	}
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
	score := make(map[string]float64, len(allTickers))
	for _, t := range allTickers {
		score[t] = 0
	}
	for _, sig := range activeSignals {
		for _, w := range normalizeWeights(sig.TargetWeights, allTickers) {
			score[w.Ticker] += w.Weight
		}
	}
	type ts struct {
		ticker string
		score  float64
	}
	ranked := make([]ts, len(allTickers))
	for i, t := range allTickers {
		ranked[i] = ts{t, score[t]}
	}
	slices.SortFunc(ranked, func(a, b ts) int { return cmp.Compare(b.score, a.score) })
	if topN > len(ranked) {
		topN = len(ranked)
	}
	ranked = ranked[:topN]
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

var nan = math.NaN()

func calcMomentum(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
	for i := period; i < len(prices); i++ {
		if prices[i-period] > 0 {
			result[i] = (prices[i]/prices[i-period] - 1) * 100
		}
	}
	return result
}
func maPct(prices, ma []float64) []float64 {
	raw := make([]float64, len(prices))
	for i := range prices {
		if !math.IsNaN(ma[i]) && ma[i] != 0 {
			raw[i] = (prices[i] - ma[i]) / ma[i]
		} else {
			raw[i] = nan
		}
	}
	return raw
}
func computeIndicatorValue(indicator TechnicalIndicator, prices []float64, period int) []*float64 {
	var raw []float64
	switch indicator {
	case IndSMA:
		raw = maPct(prices, indicators.CalcSMA(prices, period))
	case IndEMA:
		raw = maPct(prices, indicators.CalcEMA(prices, period))
	case IndRSI:
		raw = indicators.CalcRSI(prices, period)
	case IndMACD:
		raw = indicators.CalcMACDHist(prices)
	case IndBollinger:
		raw = indicators.CalcBollingerPctB(prices, period)
	case IndMomentum:
		raw = calcMomentum(prices, period)
	default:
		raw = make([]float64, len(prices))
		for i := range raw {
			raw[i] = nan
		}
	}
	result := make([]*float64, len(raw))
	for i, v := range raw {
		if !math.IsNaN(v) {
			vc := v
			result[i] = &vc
		}
	}
	return result
}
func RunTacticalBacktest(ctx context.Context, req TacticalBacktestRequest) (*TacticalBacktestResult, error) {
	strategy := req.Strategy
	allTickers := collectTickers(strategy)
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
		dailyRets := make([]float64, 0, len(values)-1)
		for i := 1; i < len(values); i++ {
			r := 0.0
			if values[i-1] > 0 {
				r = (values[i] - values[i-1]) / values[i-1]
			}
			dailyRets = append(dailyRets, r)
		}
		stats = engine.CalculateStatisticsFromRequest(engine.StatisticsRequest{Values: values, Dates: dts, StartingValue: req.StartingValue, DailyReturns: dailyRets, AnnualReturnValues: []float64{}, MonthlyReturnValues: []float64{}, MwrrCashflows: []engine.Cashflow{}})
	}
	return &TacticalBacktestResult{Portfolio: engine.PortfolioResult{Name: "战术分配", GrowthCurve: growthCurve, Statistics: stats}, SignalHistory: signalHistory}, nil
}
func generateRange(min, max, step float64) []float64 {
	if step <= 0 {
		return []float64{min}
	}
	var result []float64
	for v := min; v <= max+step/2; v += step {
		result = append(result, math.Round(v*1000)/1000)
	}
	if len(result) == 0 {
		result = append(result, min)
	}
	return result
}
func generateGridSignals(indicator string, prices []float64, dates []string, p1, p2 float64, freq string) []bool {
	signals := make([]bool, len(prices))
	inPos := false
	prevDate := ""
	ind := strings.ToLower(indicator)
	threshold := p2 / 100
	var rsi, ma []float64
	switch ind {
	case "rsi":
		rsi = indicators.CalcRSI(prices, int(p1))
	case "sma":
		ma = indicators.CalcSMA(prices, int(p1))
	case "ema":
		ma = indicators.CalcEMA(prices, int(p1))
	}
	for i := 0; i < len(prices); i++ {
		canRebalance := engineutil.ShouldRebalance(freq, prevDate, dates[i], 0, nil, nil, 0, nil)
		if ind == "rsi" {
			if math.IsNaN(rsi[i]) {
				signals[i], prevDate = inPos, dates[i]
				continue
			}
			if canRebalance {
				if !inPos && rsi[i] < p2 {
					inPos = true
				} else if inPos && rsi[i] > 100-p2 {
					inPos = false
				}
			}
		} else {
			if math.IsNaN(ma[i]) {
				signals[i], prevDate = inPos, dates[i]
				continue
			}
			upper, lower := ma[i]*(1+threshold), ma[i]*(1-threshold)
			if canRebalance {
				if !inPos && prices[i] > upper {
					inPos = true
				} else if inPos && prices[i] < lower {
					inPos = false
				}
			}
		}
		signals[i], prevDate = inPos, dates[i]
	}
	return signals
}
func buildSyntheticPrices(dates []string, prices []float64, signals []bool) map[string]float64 {
	synthetic := make(map[string]float64, len(dates))
	if len(dates) == 0 {
		return synthetic
	}
	synthetic[dates[0]] = prices[0]
	prev := prices[0]
	for i := 1; i < len(dates); i++ {
		actualRet := 0.0
		if prices[i-1] > 0 {
			actualRet = prices[i]/prices[i-1] - 1
		}
		if signals[i] {
			prev *= 1 + actualRet
		}
		synthetic[dates[i]] = prev
	}
	return synthetic
}
func getObjectiveValue(m GridCombinationMetrics, objective string) float64 {
	switch objective {
	case "minDrawdown":
		return -m.MaxDrawdown
	case "maxSharpe":
		return m.Sharpe
	default:
		return m.CAGR
	}
}
func RunGridSearch(ctx context.Context, req TacticalGridRequest) (*TacticalGridResponse, error) {
	p1Vals := generateRange(req.Param1.Min, req.Param1.Max, req.Param1.Step)
	p2Vals := generateRange(req.Param2.Min, req.Param2.Max, req.Param2.Step)
	total := len(p1Vals) * len(p2Vals)
	allMetrics := make([]GridCombinationMetrics, 0, total)
	allResults := make([]TopCombinationResult, 0, total)
	for _, p1 := range p1Vals {
		for _, p2 := range p2Vals {
			signals := generateGridSignals(req.Indicator, req.Prices, req.Dates, p1, p2, req.RebalanceFrequency)
			synthetic := buildSyntheticPrices(req.Dates, req.Prices, signals)
			btReq := engine.BacktestRequest{Portfolios: []engine.PortfolioInput{{Name: "grid-" + ftoa(p1) + "-" + ftoa(p2), Assets: []engine.AssetInput{{Ticker: req.TradingTicker, Weight: 100}}, RebalanceFrequency: "none"}}, PriceData: map[string]map[string]float64{req.TradingTicker: synthetic}, Params: engine.BacktestParams{StartDate: req.StartDate, EndDate: req.EndDate, StartingValue: req.StartingValue, RollingWindowMonths: 12}}
			btResult, err := engine.RunBacktest(ctx, btReq)
			if err != nil || len(btResult.Portfolios) == 0 {
				fallback := GridCombinationMetrics{Param1: p1, Param2: p2}
				allMetrics = append(allMetrics, fallback)
				allResults = append(allResults, TopCombinationResult{GridCombinationMetrics: fallback})
				continue
			}
			pr := btResult.Portfolios[0]
			m := GridCombinationMetrics{Param1: p1, Param2: p2, CAGR: pr.Statistics.CAGR, MaxDrawdown: pr.Statistics.MaxDrawdown, Sharpe: pr.Statistics.Sharpe, TotalReturn: pr.Statistics.TotalReturn, Stdev: pr.Statistics.Stdev, Calmar: pr.Statistics.Calmar}
			allMetrics = append(allMetrics, m)
			allResults = append(allResults, TopCombinationResult{GridCombinationMetrics: m, GrowthCurve: pr.GrowthCurve})
		}
	}
	objVal := func(m GridCombinationMetrics) float64 { return getObjectiveValue(m, req.Objective) }
	slices.SortFunc(allMetrics, func(a, b GridCombinationMetrics) int { return cmp.Compare(objVal(b), objVal(a)) })
	slices.SortFunc(allResults, func(a, b TopCombinationResult) int {
		return cmp.Compare(objVal(b.GridCombinationMetrics), objVal(a.GridCombinationMetrics))
	})
	topN := 10
	if req.TopN != nil && *req.TopN > 0 {
		topN = *req.TopN
	}
	if topN > len(allResults) {
		topN = len(allResults)
	}
	topResults := allResults[:topN]
	param1Label, param2Label := strings.ToUpper(req.Indicator)+" 周期", "突破阈值(%)"
	if req.Indicator == "rsi" {
		param1Label, param2Label = "RSI 周期", "超卖阈值"
	}
	idx := make(map[[2]float64]int, len(allResults))
	for i, r := range allResults {
		idx[[2]float64{r.Param1, r.Param2}] = i
	}
	matrix := make([][]*float64, len(p1Vals))
	for i, p1 := range p1Vals {
		matrix[i] = make([]*float64, len(p2Vals))
		for j, p2 := range p2Vals {
			if k, ok := idx[[2]float64{p1, p2}]; ok {
				v := objVal(allResults[k].GridCombinationMetrics)
				matrix[i][j] = &v
			}
		}
	}
	var best *TopCombinationResult
	if len(topResults) > 0 {
		best = &topResults[0]
	}
	return &TacticalGridResponse{TotalCombinations: total, AllMetrics: allMetrics, TopResults: topResults, Heatmap: HeatmapData{Param1Label: param1Label, Param2Label: param2Label, Param1Values: p1Vals, Param2Values: p2Vals, Matrix: matrix, Objective: req.Objective}, BestCombination: best}, nil
}
func ftoa(f float64) string {
	s := strconv.FormatFloat(f, 'f', 3, 64)
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}
