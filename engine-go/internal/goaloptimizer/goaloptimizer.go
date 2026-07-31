// Package goaloptimizer 提供目标优化（蒙特卡洛模拟）功能。
package goaloptimizer

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"math"
	"math/rand"
)

const tradingDaysPerYear = engineutil.TradingDaysPerYear

type Asset struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type Constraints struct {
	MaxDrawdown    *float64 `json:"maxDrawdown,omitempty"`
	MinSuccessRate *float64 `json:"minSuccessRate,omitempty"`
	MaxVolatility  *float64 `json:"maxVolatility,omitempty"`
}
type GoalOptimizerRequest struct {
	TargetAmount   float64                       `json:"targetAmount"`
	InitialAmount  float64                       `json:"initialAmount"`
	Years          float64                       `json:"years"`
	Assets         []Asset                       `json:"assets"`
	Constraints    *Constraints                  `json:"constraints,omitempty"`
	NumSimulations *int                          `json:"numSimulations,omitempty"`
	PriceData      map[string]map[string]float64 `json:"priceData"`
	StartDate      string                        `json:"startDate"`
	EndDate        string                        `json:"endDate"`
}
type ProbabilityPoint struct {
	Amount      float64 `json:"amount"`
	Probability float64 `json:"probability"`
}
type OptimalPathPoint struct {
	Year   int     `json:"year"`
	Median float64 `json:"median"`
	P10    float64 `json:"p10"`
	P90    float64 `json:"p90"`
}
type Recommendation struct {
	ExpectedReturn       float64 `json:"expectedReturn"`
	RequiredContribution float64 `json:"requiredContribution"`
	SuccessRate          float64 `json:"successRate"`
}
type GoalOptimizerResult struct {
	SuccessProbability float64            `json:"successProbability"`
	ProbabilityCurve   []ProbabilityPoint `json:"probabilityCurve"`
	OptimalPath        []OptimalPathPoint `json:"optimalPath"`
	Recommendation     Recommendation     `json:"recommendation"`
}
type pathMetrics struct {
	finalValue  float64
	maxDrawdown float64
	volatility  float64
}

func calcPortfolioDailyReturns(assets []Asset, priceData map[string]map[string]float64, startDate, endDate string) []float64 {
	var validAssets []Asset
	for _, a := range assets {
		if pd, ok := priceData[a.Ticker]; ok && len(pd) > 0 {
			validAssets = append(validAssets, a)
		}
	}
	if len(validAssets) == 0 {
		return nil
	}
	totalWeight := 0.0
	for _, a := range validAssets {
		totalWeight += math.Abs(a.Weight)
	}
	if totalWeight == 0 {
		return nil
	}
	tickers := make([]string, len(validAssets))
	weights := make([]float64, len(validAssets))
	for i, a := range validAssets {
		tickers[i] = a.Ticker
		weights[i] = math.Abs(a.Weight) / totalWeight
	}
	allDates := engineutil.AlignDates(tickers, priceData)
	var commonDates []string
	for _, d := range allDates {
		if d >= startDate && d <= endDate {
			commonDates = append(commonDates, d)
		}
	}
	if len(commonDates) < 2 {
		return nil
	}
	return engineutil.WeightedDailyReturns(tickers, weights, priceData, commonDates, false, false)
}
func OptimizeGoals(req GoalOptimizerRequest) (*GoalOptimizerResult, error) {
	validAssets := make([]Asset, 0, len(req.Assets))
	for _, a := range req.Assets {
		if a.Ticker != "" {
			validAssets = append(validAssets, a)
		}
	}
	dailyReturns := calcPortfolioDailyReturns(validAssets, req.PriceData, req.StartDate, req.EndDate)
	dailyMean := mathutil.Mean(dailyReturns)
	dailyStd := mathutil.Std(dailyReturns)
	annualMeanReturn := dailyMean * tradingDaysPerYear
	numSims := 1000
	if req.NumSimulations != nil && *req.NumSimulations > 0 {
		numSims = *req.NumSimulations
	}
	if numSims > 10000 {
		numSims = 10000
	}
	if numSims < 1 {
		numSims = 1
	}
	totalDays := int(math.Round(req.Years * tradingDaysPerYear))
	rnd := rand.New(rand.NewSource(42)) // 确定性种子保证可复现
	paths := make([][]float64, numSims)
	metrics := make([]pathMetrics, numSims)
	for s := 0; s < numSims; s++ {
		path := make([]float64, 0, totalDays+1)
		path = append(path, req.InitialAmount)
		var dailyRets []float64
		peak := req.InitialAmount
		maxDD := 0.0
		for d := 0; d < totalDays; d++ {
			r := mathutil.GaussianRandom(rnd, dailyMean, dailyStd)
			dailyRets = append(dailyRets, r)
			nextValue := path[len(path)-1] * (1 + r)
			path = append(path, nextValue)
			if nextValue > peak {
				peak = nextValue
			}
			if peak > 0 {
				dd := (peak - nextValue) / peak
				if dd > maxDD {
					maxDD = dd
				}
			}
		}
		vol := 0.0
		if len(dailyRets) > 1 {
			vol = mathutil.Std(dailyRets) * math.Sqrt(tradingDaysPerYear)
		}
		paths[s] = path
		metrics[s] = pathMetrics{finalValue: path[len(path)-1], maxDrawdown: maxDD, volatility: vol}
	}
	var filteredMetrics []pathMetrics
	var filteredPaths [][]float64
	if req.Constraints != nil {
		for i := 0; i < len(metrics); i++ {
			if req.Constraints.MaxDrawdown != nil && metrics[i].maxDrawdown > *req.Constraints.MaxDrawdown {
				continue
			}
			if req.Constraints.MaxVolatility != nil && metrics[i].volatility > *req.Constraints.MaxVolatility {
				continue
			}
			filteredMetrics = append(filteredMetrics, metrics[i])
			filteredPaths = append(filteredPaths, paths[i])
		}
	} else {
		filteredMetrics = metrics
		filteredPaths = paths
	}
	if len(filteredMetrics) == 0 {
		return &GoalOptimizerResult{
			SuccessProbability: 0, ProbabilityCurve: nil, OptimalPath: nil, Recommendation: Recommendation{ExpectedReturn: annualMeanReturn, RequiredContribution: 0, SuccessRate: 0},
		}, nil
	}
	finalValues := make([]float64, len(filteredMetrics))
	successCount := 0
	for i, m := range filteredMetrics {
		finalValues[i] = m.finalValue
		if m.finalValue >= req.TargetAmount {
			successCount++
		}
	}
	successProbability := float64(successCount) / float64(len(finalValues))
	probabilityCurve := buildProbabilityCurve(finalValues)
	optimalPath := buildOptimalPath(filteredPaths, req.Years)
	medianFinalValue := mathutil.Percentile(finalValues, 0.5)
	requiredContribution := calcRequiredContribution(req.InitialAmount, req.TargetAmount, req.Years, medianFinalValue)
	return &GoalOptimizerResult{
		SuccessProbability: successProbability, ProbabilityCurve: probabilityCurve,
		OptimalPath: optimalPath, Recommendation: Recommendation{ExpectedReturn: annualMeanReturn,
			RequiredContribution: requiredContribution, SuccessRate: successProbability,
		},
	}, nil
}
func buildProbabilityCurve(finalValues []float64) []ProbabilityPoint {
	if len(finalValues) == 0 {
		return nil
	}
	const binCount = 50
	counts, minVal, maxVal := mathutil.Histogram(finalValues, binCount)
	if maxVal == minVal {
		return []ProbabilityPoint{{Amount: math.Round(minVal), Probability: 1}}
	}
	binWidth := (maxVal - minVal) / float64(binCount)
	total := float64(len(finalValues))
	result := make([]ProbabilityPoint, binCount)
	for i, c := range counts {
		result[i] = ProbabilityPoint{Amount: math.Round(minVal + (float64(i)+0.5)*binWidth), Probability: float64(c) / total}
	}
	return result
}
func buildOptimalPath(paths [][]float64, years float64) []OptimalPathPoint {
	var result []OptimalPathPoint
	pathLen := len(paths[0])
	numYears := int(math.Ceil(years))
	for y := 0; y <= numYears; y++ {
		dayIdx := int(float64(y) * tradingDaysPerYear)
		if dayIdx >= pathLen {
			dayIdx = pathLen - 1
		}
		values := make([]float64, len(paths))
		for i, p := range paths {
			if dayIdx < len(p) {
				values[i] = p[dayIdx]
			}
		}
		result = append(result, OptimalPathPoint{Year: y, Median: mathutil.Percentile(values, 0.5), P10: mathutil.Percentile(values, 0.1), P90: mathutil.Percentile(values, 0.9)})
	}
	return result
}
func calcRequiredContribution(initialAmount, targetAmount, years, medianFinalValue float64) float64 {
	if medianFinalValue >= targetAmount {
		return 0
	}
	growthFactor := 1.0
	if medianFinalValue > 0 && initialAmount > 0 {
		growthFactor = medianFinalValue / initialAmount
	}
	r := 0.0
	if years > 0 && growthFactor > 0 {
		r = math.Pow(growthFactor, 1/years) - 1
	}
	fvInitial := initialAmount * math.Pow(1+r, years)
	gap := targetAmount - fvInitial
	if gap <= 0 {
		return 0
	}
	if math.Abs(r) < 1e-6 {
		return gap / years
	}
	annuityFactor := (math.Pow(1+r, years) - 1) / r
	if annuityFactor > 0 {
		return gap / annuityFactor
	}
	return gap / years
}
