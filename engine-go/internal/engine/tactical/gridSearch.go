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

const (
	maxRangePoints = 500
	maxGridCombos  = 1000
)

func generateRange(min, max, step float64) []float64 {
	if step <= 0 {
		return []float64{min}
	}
	result := make([]float64, 0, maxRangePoints)
	for v := min; v <= max+step/2 && len(result) < maxRangePoints; v += step {
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
	var series []float64
	var enter, exit func(int) bool
	switch ind {
	case "rsi":
		series = indicators.CalcRSI(prices, int(p1))
		enter = func(i int) bool { return series[i] < p2 }
		exit = func(i int) bool { return series[i] > 100-p2 }
	case "sma", "ema":
		series = indicators.CalcSMA(prices, int(p1))
		if ind == "ema" {
			series = indicators.CalcEMA(prices, int(p1))
		}
		enter = func(i int) bool { return prices[i] > series[i]*(1+threshold) }
		exit = func(i int) bool { return prices[i] < series[i]*(1-threshold) }
	}
	for i := 0; i < len(prices); i++ {
		canRebalance := engineutil.ShouldRebalance(freq, prevDate, dates[i], 0, nil, nil, 0, nil)
		if math.IsNaN(series[i]) {
			signals[i], prevDate = inPos, dates[i]
			continue
		}
		if canRebalance {
			if !inPos && enter(i) {
				inPos = true
			} else if inPos && exit(i) {
				inPos = false
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
	if total > maxGridCombos {
		return nil, engineutil.NewInputError("网格组合数 %d 超过上限 %d", total, maxGridCombos)
	}
	allMetrics := make([]GridCombinationMetrics, 0, total)
	allResults := make([]TopCombinationResult, 0, total)
	for _, p1 := range p1Vals {
		for _, p2 := range p2Vals {
			signals := generateGridSignals(req.Indicator, req.Prices, req.Dates, p1, p2, req.RebalanceFrequency)
			synthetic := buildSyntheticPrices(req.Dates, req.Prices, signals)
			btReq := engine.BacktestRequest{Portfolios: []engine.PortfolioInput{{Name: "grid-" + ftoa(p1) + "-" + ftoa(p2), Assets: []engine.AssetInput{{Ticker: req.TradingTicker, Weight: 100}}, RebalanceFrequency: "none"}}, PriceData: map[string]map[string]float64{req.TradingTicker: synthetic}, Params: engine.BacktestParams{StartDate: req.StartDate, EndDate: req.EndDate, StartingValue: req.StartingValue, RollingWindowMonths: 12}}
			btResult, err := engine.RunBacktest(ctx, btReq)
			if err != nil {
				return nil, err
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
