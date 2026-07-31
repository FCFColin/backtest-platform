// Package montecarlo 提供蒙特卡洛模拟核心计算逻辑（T-ARCH-2.3）。
package montecarlo

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"fmt"
	"math"
	mrand "math/rand"
	"runtime"
	"slices"
	"sort"
	"sync"
	"time"
)

const (
	mcTradingDays   = 252  // 年交易日数
	mcRiskFreeRate  = 0.02 // 无风险利率
	mcHistogramBins = 50   // 直方图分箱数
	mcDefaultSims   = 1000 // 默认模拟次数
	mcDefaultYears  = 20   // 默认模拟年数
)

func RunMonteCarlo(ctx context.Context, req MonteCarloRequest) (*MonteCarloResult, error) {
	applyDefaults(&req)
	dailyReturns, err := computePortfolioDailyReturns(req.Portfolio, req.PriceData, req.Params)
	if err != nil {
		return nil, fmt.Errorf("计算组合日收益率失败: %w", err)
	}
	if len(dailyReturns) < mcTradingDays {
		return nil, fmt.Errorf("历史数据不足：需要至少1年(%d天)的日收益率，实际%d天", mcTradingDays, len(dailyReturns))
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	totalDays := req.MCParams.NumYears * mcTradingDays
	paths := runSimulations(ctx, dailyReturns, totalDays, req.MCParams.NumSimulations, req.MCParams, req.Params.StartingValue)
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
	if req.MCParams.NumSimulations <= 0 {
		req.MCParams.NumSimulations = mcDefaultSims
	}
	if req.MCParams.NumYears <= 0 {
		req.MCParams.NumYears = mcDefaultYears
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
	if req.Params.StartingValue <= 0 {
		req.Params.StartingValue = 10000
	}
	if req.MCParams.SuccessThreshold <= 0 {
		req.MCParams.SuccessThreshold = 1.0
	}
}
func computePortfolioDailyReturns(portfolio MCPortfolioInput, priceData PriceDataMap, params MCBacktestParams) ([]float64, error) {
	if len(portfolio.Assets) == 0 {
		return nil, fmt.Errorf("组合无资产")
	}
	tradingDates, err := engineutil.ParseTradingDates(priceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}
	tradingDates = engineutil.FilterByDateRange(tradingDates, params.StartDate, params.EndDate)
	if len(tradingDates) == 0 {
		return nil, fmt.Errorf("日期范围内无交易数据")
	}
	weights := make(map[string]float64, len(portfolio.Assets))
	for _, a := range portfolio.Assets {
		weights[a.Ticker] = a.Weight / 100.0
	}
	type assetPrices struct {
		prices []float64
		weight float64
	}
	assetList := make([]assetPrices, 0, len(portfolio.Assets))
	for _, a := range portfolio.Assets {
		assetList = append(assetList, assetPrices{prices: engineutil.ExtractPrices(priceData, a.Ticker, tradingDates), weight: weights[a.Ticker]})
	}
	returns := make([]float64, 0, len(tradingDates)-1)
	for i := 1; i < len(tradingDates); i++ {
		weightedReturn := 0.0
		totalWeight := 0.0
		for _, ap := range assetList {
			prevPrice := ap.prices[i-1]
			currPrice := ap.prices[i]
			if prevPrice > 0 && currPrice > 0 {
				weightedReturn += ap.weight * ((currPrice - prevPrice) / prevPrice)
				totalWeight += ap.weight
			}
		}
		if totalWeight > 0 {
			weightedReturn /= totalWeight
		}
		if portfolio.Drag > 0 {
			weightedReturn -= portfolio.Drag / float64(mcTradingDays)
		}
		returns = append(returns, weightedReturn)
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
	cagr := 0.0
	if startingValue > 0 && years > 0 && finalValue > 0 {
		cagr = math.Pow(finalValue/startingValue, 1.0/years) - 1
	}
	pathLen := len(path)
	dailyRets := make([]float64, pathLen-1)
	for j := 1; j < pathLen; j++ {
		if path[j-1] > 0 {
			dailyRets[j-1] = (path[j] - path[j-1]) / path[j-1]
		}
	}
	maxDD := engine.CalcMaxDrawdown(path).MaxDrawdown
	vol := 0.0
	if len(dailyRets) > 1 {
		vol = mathutil.Std(dailyRets) * math.Sqrt(float64(mcTradingDays))
	}
	sharpe := 0.0
	if vol > 0 {
		sharpe = (cagr - mcRiskFreeRate) / vol
	}
	return PathMetrics{FinalValue: finalValue, CAGR: cagr, MaxDrawdown: maxDD, Volatility: vol, Sharpe: sharpe, Sortino: mcSortino(dailyRets, cagr)}
}
func computeMCStatistics(paths [][]float64, threshold float64, startingValue float64) MCStatistics {
	if len(paths) == 0 {
		return MCStatistics{}
	}
	finalValues := make([]float64, len(paths))
	target := startingValue * threshold
	successCount := 0
	for i, path := range paths {
		finalValues[i] = path[len(path)-1]
		if finalValues[i] >= target {
			successCount++
		}
	}
	slices.Sort(finalValues)
	n := len(finalValues)
	medianIdx := n / 2
	medianVal := finalValues[medianIdx]
	if n%2 == 0 && medianIdx > 0 {
		medianVal = (finalValues[medianIdx-1] + finalValues[medianIdx]) / 2
	}
	return MCStatistics{MedianFinalValue: medianVal, MeanFinalValue: mathutil.Mean(finalValues), SuccessRate: float64(successCount) / float64(n)}
}
func mcSortino(dailyRets []float64, cagr float64) float64 {
	if len(dailyRets) == 0 {
		return 0
	}
	dailyRF := mcRiskFreeRate / float64(mcTradingDays)
	sumSq := 0.0
	for _, r := range dailyRets {
		if excess := r - dailyRF; excess < 0 {
			sumSq += excess * excess
		}
	}
	downsideDev := math.Sqrt(sumSq/float64(len(dailyRets))) * math.Sqrt(float64(mcTradingDays))
	if downsideDev == 0 {
		return 0
	}
	return (cagr - mcRiskFreeRate) / downsideDev
}

type MonteCarloRequest struct {
	Portfolio MCPortfolioInput `json:"portfolio"`
	PriceData PriceDataMap     `json:"priceData"`
	Params    MCBacktestParams `json:"params"`
	MCParams  MCSimParams      `json:"mcParams"`
}
type MCPortfolioInput struct {
	Name               string       `json:"name"`
	Assets             []AssetInput `json:"assets"`
	RebalanceFrequency string       `json:"rebalanceFrequency"`
	Drag               float64      `json:"drag"`
	TotalReturn        bool         `json:"totalReturn"`
}
type AssetInput struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type PriceDataMap = engine.PriceDataMap
type MCBacktestParams struct {
	StartDate           string  `json:"startDate"`
	EndDate             string  `json:"endDate"`
	StartingValue       float64 `json:"startingValue"`
	AdjustForInflation  bool    `json:"adjustForInflation"`
	RollingWindowMonths int     `json:"rollingWindowMonths"`
	BenchmarkTicker     string  `json:"benchmarkTicker"`
}
type MCSimParams struct {
	NumSimulations   int     `json:"numSimulations"`
	NumYears         int     `json:"numYears"`
	MinBlockYears    int     `json:"minBlockYears"`
	MaxBlockYears    int     `json:"maxBlockYears"`
	SuccessThreshold float64 `json:"successThreshold"`
}
type MonteCarloResult struct {
	Percentiles          MCPercentiles          `json:"percentiles"`
	SuccessProbability   []float64              `json:"successProbability"`
	FinalDistribution    []float64              `json:"finalDistribution"`
	Statistics           MCStatistics           `json:"statistics"`
	PerPathMetrics       []PathMetrics          `json:"perPathMetrics"`
	RepresentativePaths  MCRepresentativePaths  `json:"representativePaths"`
	SuccessProbabilities MCSuccessProbabilities `json:"successProbabilities"`
}
type MCPercentiles struct {
	P5  []float64 `json:"p5"`
	P10 []float64 `json:"p10"`
	P25 []float64 `json:"p25"`
	P50 []float64 `json:"p50"`
	P75 []float64 `json:"p75"`
	P90 []float64 `json:"p90"`
	P95 []float64 `json:"p95"`
}
type MCStatistics struct {
	MedianFinalValue float64 `json:"medianFinalValue"`
	MeanFinalValue   float64 `json:"meanFinalValue"`
	SuccessRate      float64 `json:"successRate"`
}
type PathMetrics struct {
	FinalValue  float64 `json:"finalValue"`
	CAGR        float64 `json:"cagr"`
	MaxDrawdown float64 `json:"maxDrawdown"`
	Volatility  float64 `json:"volatility"`
	Sharpe      float64 `json:"sharpe"`
	Sortino     float64 `json:"sortino"`
}
type MCRepresentativePaths struct {
	Best   []float64 `json:"best"`
	P25    []float64 `json:"p25"`
	Median []float64 `json:"median"`
	P75    []float64 `json:"p75"`
	Worst  []float64 `json:"worst"`
}
type MCSuccessProbabilities struct {
	Survival            []float64 `json:"survival"`
	CapitalPreservation []float64 `json:"capitalPreservation"`
	Profit              []float64 `json:"profit"`
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
	numSims := float64(len(paths))
	for day := 0; day < totalDays; day++ {
		success := 0
		for _, path := range paths {
			if path[day] >= target {
				success++
			}
		}
		result[day] = float64(success) / numSims
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
		dayIdx := year*mcTradingDays - 1
		if dayIdx >= pathLen {
			dayIdx = pathLen - 1
		}
		survCount := 0
		capPresCount := 0
		profitCount := 0
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
	finalValues := make([]float64, len(paths))
	for i, path := range paths {
		finalValues[i] = path[len(path)-1]
	}
	sorted := make([]float64, len(finalValues))
	copy(sorted, finalValues)
	slices.Sort(sorted)
	minVal := sorted[0]
	maxVal := sorted[len(sorted)-1]
	if maxVal == minVal {
		result := make([]float64, mcHistogramBins)
		result[mcHistogramBins/2] = float64(len(paths))
		return result
	}
	binWidth := (maxVal - minVal) / float64(mcHistogramBins)
	result := make([]float64, mcHistogramBins)
	for _, v := range finalValues {
		bin := int((v - minVal) / binWidth)
		if bin >= mcHistogramBins {
			bin = mcHistogramBins - 1
		}
		if bin < 0 {
			bin = 0
		}
		result[bin]++
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
	sorted := make([]pathIndex, len(paths))
	for i, path := range paths {
		sorted[i] = pathIndex{idx: i, finalValue: path[len(path)-1]}
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
func runSimulations(ctx context.Context, historicalReturns []float64, totalDays int, numSims int, mcParams MCSimParams, startingValue float64) [][]float64 {
	numCPU := runtime.NumCPU()
	if numCPU > numSims {
		numCPU = numSims
	}
	if numCPU < 1 {
		numCPU = 1
	}
	paths := make([][]float64, numSims)
	var wg sync.WaitGroup
	simsPerWorker := numSims / numCPU
	extra := numSims % numCPU
	idx := 0
	for w := 0; w < numCPU; w++ {
		count := simsPerWorker
		if w < extra {
			count++
		}
		if count == 0 {
			continue
		}
		startIdx := idx
		idx += count
		wg.Add(1)
		go func(start, n int) {
			defer wg.Done()
			var seed int64
			var seedBuf [8]byte
			if _, err := rand.Read(seedBuf[:]); err == nil {
				seed = int64(binary.LittleEndian.Uint64(seedBuf[:]))
			} else {
				seed = time.Now().UnixNano() + int64(start)
			}
			rng := mrand.New(mrand.NewSource(seed))
			for i := start; i < start+n; i++ {
				select {
				case <-ctx.Done():
					return
				default:
				}
				path := make([]float64, totalDays)
				generatePath(path, historicalReturns, totalDays, mcParams, startingValue, rng)
				paths[i] = path
			}
		}(startIdx, count)
	}
	wg.Wait()
	return paths
}
func generatePath(path []float64, historicalReturns []float64, totalDays int, mcParams MCSimParams, startingValue float64, rng *mrand.Rand) {
	minBlockDays := mcParams.MinBlockYears * mcTradingDays
	maxBlockDays := mcParams.MaxBlockYears * mcTradingDays
	n := len(historicalReturns)
	if minBlockDays > n {
		minBlockDays = n
	}
	if maxBlockDays > n {
		maxBlockDays = n
	}
	simReturns := blockBootstrapSample(historicalReturns, totalDays, minBlockDays, maxBlockDays, rng)
	returnsToPath(path, simReturns, startingValue)
}
func blockBootstrapSample(historicalReturns []float64, totalDays int, minBlockDays, maxBlockDays int, rng *mrand.Rand) []float64 {
	n := len(historicalReturns)
	result := make([]float64, 0, totalDays)
	for len(result) < totalDays {
		blockLen := minBlockDays
		if maxBlockDays > minBlockDays {
			blockLen = minBlockDays + rng.Intn(maxBlockDays-minBlockDays+1)
		}
		startPos := rng.Intn(n)
		end := startPos + blockLen
		if end > n {
			end = n
		}
		result = append(result, historicalReturns[startPos:end]...)
	}
	return result[:totalDays]
}
func returnsToPath(path []float64, returns []float64, startingValue float64) {
	path[0] = startingValue
	for i := 1; i < len(path); i++ {
		path[i] = path[i-1] * (1.0 + returns[i-1])
		if path[i] < 0 {
			path[i] = 0
		}
	}
}
