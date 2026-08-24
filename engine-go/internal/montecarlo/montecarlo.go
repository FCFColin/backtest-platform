package montecarlo

import (
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"fmt"
	"gonum.org/v1/gonum/stat"
	"math"
	"slices"
	"sort"
)

const (
	mcTradingDays   = int(engineutil.TradingDaysPerYear)
	mcHistogramBins = 50
	mcDefaultSims   = 1000
	mcDefaultYears  = 20
	mcMaxSims       = 20000
	mcMaxYears      = 100
	mcMaxSimYears   = 100_000
)

func RunMonteCarlo(ctx context.Context, req MonteCarloRequest) (*MonteCarloResult, error) {
	applyDefaults(&req)
	dailyReturns, err := computePortfolioDailyReturns(req.Portfolio, req.PriceData, req.Params)
	if err != nil {
		return nil, fmt.Errorf("计算组合日收益率失败: %w", err)
	}
	if len(dailyReturns) < mcTradingDays {
		return nil, engineutil.NewInputError("历史数据不足：需要至少1年(%d天)的日收益率，实际%d天", mcTradingDays, len(dailyReturns))
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	totalDays := req.MCParams.NumYears * mcTradingDays
	paths := runSimulations(ctx, dailyReturns, totalDays, req.MCParams.NumSimulations, req.MCParams, req.Params.StartingValue)
	// 取消时 goroutine 可能留下 nil path，禁止继续计算
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	percentiles := computePercentiles(paths, totalDays)
	successProb := computeSuccessProbability(paths, req.MCParams.SuccessThreshold, req.Params.StartingValue)
	successProbs := computeSuccessProbabilities(paths, req.Params.StartingValue, req.MCParams.NumYears)
	finalDist := computeFinalDistribution(paths)
	perPathMetrics := computePerPathMetrics(paths, req.Params.StartingValue, req.MCParams.NumYears)
	stats := computeMCStatistics(paths, req.MCParams.SuccessThreshold, req.Params.StartingValue)
	repPaths := computeRepresentativePaths(paths, totalDays)
	return &MonteCarloResult{Percentiles: percentiles, SuccessProbability: successProb, FinalDistribution: finalDist, Statistics: stats, PerPathMetrics: perPathMetrics, RepresentativePaths: repPaths, SuccessProbabilities: successProbs}, nil
}

func applyDefaults(req *MonteCarloRequest) {
	req.MCParams.NumSimulations = engineutil.BoundedInt(req.MCParams.NumSimulations, mcDefaultSims, mcMaxSims)
	req.MCParams.NumYears = engineutil.BoundedInt(req.MCParams.NumYears, mcDefaultYears, mcMaxYears)
	// 内存预算：sims×years 决定保留路径总量，超限则压低 sims（单请求不因 OOM 打垮引擎）
	if req.MCParams.NumSimulations*req.MCParams.NumYears > mcMaxSimYears {
		req.MCParams.NumSimulations = max(mcDefaultSims, mcMaxSimYears/req.MCParams.NumYears)
	}
	if req.MCParams.MinBlockYears <= 0 {
		req.MCParams.MinBlockYears = 1
	}
	if req.MCParams.MaxBlockYears <= 0 {
		req.MCParams.MaxBlockYears = 5
	}
	if req.MCParams.MinBlockYears > req.MCParams.MaxBlockYears {
		req.MCParams.MinBlockYears, req.MCParams.MaxBlockYears = req.MCParams.MaxBlockYears, req.MCParams.MinBlockYears
	}
	req.Params.StartingValue = engineutil.DefaultStartingValue(req.Params.StartingValue)
	if req.MCParams.SuccessThreshold <= 0 {
		req.MCParams.SuccessThreshold = 1.0
	}
}

func computePortfolioDailyReturns(portfolio MCPortfolioInput, priceData PriceDataMap, params MCBacktestParams) ([]float64, error) {
	if len(portfolio.Assets) == 0 {
		return nil, engineutil.NewInputError("组合无资产")
	}
	tradingDates := engineutil.ParseTradingDates(priceData)
	tradingDates = engineutil.FilterByDateRange(tradingDates, params.StartDate, params.EndDate)
	if len(tradingDates) == 0 {
		return nil, engineutil.NewInputError("日期范围内无交易数据")
	}
	tickers := make([]string, len(portfolio.Assets))
	weights := make([]float64, len(portfolio.Assets))
	for i, a := range portfolio.Assets {
		tickers[i] = a.Ticker
		weights[i] = a.Weight / 100.0
	}
	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates {
		dates[i] = d.Format("2006-01-02")
	}
	returns := engineutil.WeightedDailyReturns(tickers, weights, priceData, dates, true, true)
	// Drag 为年化百分比，按日复利摊薄后以乘法作用于收益率（与 engine/backtest.go 的 holdings *= dailyDrag 口径一致）
	if portfolio.Drag > 0 {
		dailyDragFactor := math.Pow(1-portfolio.Drag/100.0, 1.0/float64(mcTradingDays))
		for i := range returns {
			returns[i] = (1+returns[i])*dailyDragFactor - 1
		}
	}
	return returns, nil
}

func computePerPathMetrics(paths [][]float64, startingValue float64, numYears int) []PathMetrics {
	if len(paths) == 0 {
		return nil
	}
	metrics := make([]PathMetrics, len(paths))
	years := float64(numYears)
	for i, path := range paths {
		metrics[i] = calcPathMetrics(path, startingValue, years)
	}
	return metrics
}
func calcPathMetrics(path []float64, startingValue float64, years float64) PathMetrics {
	finalValue := path[len(path)-1]
	cagr := engine.CalcCAGR(startingValue, finalValue, years)
	dailyRets := mathutil.DailyReturnsWithZeros(path)
	return PathMetrics{FinalValue: finalValue, CAGR: cagr, MaxDrawdown: engine.CalcMaxDrawdown(path).MaxDrawdown, Volatility: engine.CalcAnnualizedStdev(dailyRets), Sharpe: engine.CalcSharpe(cagr, engine.CalcAnnualizedStdev(dailyRets)), Sortino: engine.CalcSortino(cagr, dailyRets)}
}

func finalValues(paths [][]float64) []float64 {
	vals := make([]float64, len(paths))
	for i, p := range paths {
		vals[i] = p[len(p)-1]
	}
	return vals
}
func successFractionAtOrAbove(paths [][]float64, day int, target float64) float64 {
	success := 0
	for _, p := range paths {
		if p[day] >= target {
			success++
		}
	}
	return float64(success) / float64(len(paths))
}
func computeMCStatistics(paths [][]float64, threshold float64, startingValue float64) MCStatistics {
	if len(paths) == 0 {
		return MCStatistics{}
	}
	finalValuesList := finalValues(paths)
	target := startingValue * threshold
	successRate := successFractionAtOrAbove(paths, len(paths[0])-1, target)
	slices.Sort(finalValuesList)
	n := len(finalValuesList)
	medianIdx := n / 2
	medianVal := finalValuesList[medianIdx]
	if n%2 == 0 && medianIdx > 0 {
		medianVal = (finalValuesList[medianIdx-1] + finalValuesList[medianIdx]) / 2
	}
	return MCStatistics{MedianFinalValue: medianVal, MeanFinalValue: stat.Mean(finalValuesList, nil), SuccessRate: successRate}
}
func computePercentiles(paths [][]float64, totalDays int) MCPercentiles {
	numSims := len(paths)
	if numSims == 0 {
		return MCPercentiles{}
	}
	p5 := make([]float64, totalDays)
	p10 := make([]float64, totalDays)
	p25 := make([]float64, totalDays)
	p50 := make([]float64, totalDays)
	p75 := make([]float64, totalDays)
	p90 := make([]float64, totalDays)
	p95 := make([]float64, totalDays)
	type pctTarget struct {
		pct float64
		dst *[]float64
	}
	targets := []pctTarget{{0.05, &p5}, {0.10, &p10}, {0.25, &p25}, {0.50, &p50}, {0.75, &p75}, {0.90, &p90}, {0.95, &p95}}
	values := make([]float64, numSims)
	for day := 0; day < totalDays; day++ {
		for i, path := range paths {
			values[i] = path[day]
		}
		slices.Sort(values)
		for _, t := range targets {
			(*t.dst)[day] = values[max(0, min(int(float64(numSims-1)*t.pct), numSims-1))]
		}
	}
	return MCPercentiles{P5: p5, P10: p10, P25: p25, P50: p50, P75: p75, P90: p90, P95: p95}
}
func computeSuccessProbability(paths [][]float64, threshold float64, startingValue float64) []float64 {
	if len(paths) == 0 {
		return nil
	}
	totalDays := len(paths[0])
	target := startingValue * threshold
	result := make([]float64, totalDays)
	for day := 0; day < totalDays; day++ {
		result[day] = successFractionAtOrAbove(paths, day, target)
	}
	return result
}
func computeSuccessProbabilities(paths [][]float64, startingValue float64, numYears int) MCSuccessProbabilities {
	if len(paths) == 0 {
		return MCSuccessProbabilities{}
	}
	survival := make([]float64, numYears)
	capitalPreservation := make([]float64, numYears)
	profit := make([]float64, numYears)
	n := float64(len(paths))
	pathLen := len(paths[0])
	for year := 1; year <= numYears; year++ {
		dayIdx := min(year*mcTradingDays-1, pathLen-1)
		var survCount, capPresCount, profitCount int
		for _, path := range paths {
			val := path[dayIdx]
			if val > 0 {
				survCount++
			}
			if val >= startingValue {
				capPresCount++
			}
			if val > startingValue {
				profitCount++
			}
		}
		idx := year - 1
		survival[idx] = float64(survCount) / n
		capitalPreservation[idx] = float64(capPresCount) / n
		profit[idx] = float64(profitCount) / n
	}
	return MCSuccessProbabilities{Survival: survival, CapitalPreservation: capitalPreservation, Profit: profit}
}
func computeFinalDistribution(paths [][]float64) []float64 {
	if len(paths) == 0 {
		return nil
	}
	counts, minVal, maxVal := mathutil.Histogram(finalValues(paths), mcHistogramBins)
	result := make([]float64, len(counts))
	if maxVal == minVal {
		result[len(counts)/2] = float64(len(paths))
		return result
	}
	for i, c := range counts {
		result[i] = float64(c)
	}
	return result
}
func computeRepresentativePaths(paths [][]float64, totalDays int) MCRepresentativePaths {
	if len(paths) == 0 {
		return MCRepresentativePaths{}
	}
	type pathIndex struct {
		idx        int
		finalValue float64
	}
	finalVals := finalValues(paths)
	sorted := make([]pathIndex, len(paths))
	for i, v := range finalVals {
		sorted[i] = pathIndex{idx: i, finalValue: v}
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].finalValue < sorted[j].finalValue })
	n := len(sorted)
	return MCRepresentativePaths{Worst: downsampleMonthly(paths[sorted[0].idx]), P25: downsampleMonthly(paths[sorted[int(float64(n)*0.25)].idx]), Median: downsampleMonthly(paths[sorted[n/2].idx]), P75: downsampleMonthly(paths[sorted[int(float64(n)*0.75)].idx]), Best: downsampleMonthly(paths[sorted[n-1].idx])}
}
func downsampleMonthly(path []float64) []float64 {
	result := make([]float64, 0, len(path)/21+1)
	for i := 0; i < len(path); i += 21 {
		result = append(result, path[i])
	}
	if len(path) > 0 && (len(path)-1)%21 != 0 {
		result = append(result, path[len(path)-1])
	}
	return result
}
