// Package goaloptimizer 提供目标优化（蒙特卡洛模拟）功能。
// 企业理由：将目标优化逻辑从 TS 端迁移到 Go 引擎，统一计算入口（ADR-031）。
// 算法独立实现于 Go 引擎（ADR-031），JSON 契约与 shared/types/goal.ts 对齐。
package goaloptimizer

import (
	"math"
	"math/rand"

	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
)

const tradingDaysPerYear = engineutil.TradingDaysPerYear

// Asset 资产配置。
type Asset struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}

// Constraints 约束条件。
type Constraints struct {
	MaxDrawdown   *float64 `json:"maxDrawdown,omitempty"`
	MinSuccessRate *float64 `json:"minSuccessRate,omitempty"`
	MaxVolatility *float64 `json:"maxVolatility,omitempty"`
}

// GoalOptimizerRequest 目标优化请求。
type GoalOptimizerRequest struct {
	TargetAmount   float64      `json:"targetAmount"`
	InitialAmount  float64      `json:"initialAmount"`
	Years          float64      `json:"years"`
	Assets         []Asset      `json:"assets"`
	Constraints    *Constraints `json:"constraints,omitempty"`
	NumSimulations *int         `json:"numSimulations,omitempty"`
	PriceData      map[string]map[string]float64 `json:"priceData"`
	StartDate      string       `json:"startDate"`
	EndDate        string       `json:"endDate"`
}

// ProbabilityPoint 概率分布曲线点。
type ProbabilityPoint struct {
	Amount      float64 `json:"amount"`
	Probability float64 `json:"probability"`
}

// OptimalPathPoint 最优路径点。
type OptimalPathPoint struct {
	Year   int     `json:"year"`
	Median float64 `json:"median"`
	P10    float64 `json:"p10"`
	P90    float64 `json:"p90"`
}

// Recommendation 建议配置。
type Recommendation struct {
	ExpectedReturn      float64 `json:"expectedReturn"`
	RequiredContribution float64 `json:"requiredContribution"`
	SuccessRate         float64 `json:"successRate"`
}

// GoalOptimizerResult 目标优化结果。
type GoalOptimizerResult struct {
	SuccessProbability float64             `json:"successProbability"`
	ProbabilityCurve   []ProbabilityPoint  `json:"probabilityCurve"`
	OptimalPath        []OptimalPathPoint  `json:"optimalPath"`
	Recommendation     Recommendation       `json:"recommendation"`
}

// pathMetrics 单条路径指标。
type pathMetrics struct {
	finalValue   float64
	maxDrawdown  float64
	volatility   float64
}

// calcPortfolioDailyReturns 计算组合历史日收益率序列。
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
	weights := make([]float64, len(validAssets))
	for i, a := range validAssets {
		weights[i] = math.Abs(a.Weight) / totalWeight
	}

	tickers := make([]string, len(validAssets))
	for i, a := range validAssets {
		tickers[i] = a.Ticker
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

	var returns []float64
	for i := 1; i < len(commonDates); i++ {
		portfolioReturn := 0.0
		for j := 0; j < len(validAssets); j++ {
			prev := priceData[validAssets[j].Ticker][commonDates[i-1]]
			curr := priceData[validAssets[j].Ticker][commonDates[i]]
			if prev > 0 {
				portfolioReturn += weights[j] * ((curr - prev) / prev)
			}
		}
		returns = append(returns, portfolioReturn)
	}
	return returns
}

// OptimizeGoals 目标优化主函数。
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
		metrics[s] = pathMetrics{
			finalValue:  path[len(path)-1],
			maxDrawdown: maxDD,
			volatility:  vol,
		}
	}

	// 约束过滤
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
			SuccessProbability: 0,
			ProbabilityCurve:  nil,
			OptimalPath:        nil,
			Recommendation: Recommendation{
				ExpectedReturn:      annualMeanReturn,
				RequiredContribution: 0,
				SuccessRate:         0,
			},
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

	// 概率分布曲线
	probabilityCurve := buildProbabilityCurve(finalValues)

	// 最优路径
	optimalPath := buildOptimalPath(filteredPaths, req.Years)

	// 建议配置
	medianFinalValue := mathutil.Percentile(finalValues, 0.5)
	requiredContribution := calcRequiredContribution(req.InitialAmount, req.TargetAmount, req.Years, medianFinalValue)

	return &GoalOptimizerResult{
		SuccessProbability: successProbability,
		ProbabilityCurve:   probabilityCurve,
		OptimalPath:        optimalPath,
		Recommendation: Recommendation{
			ExpectedReturn:      annualMeanReturn,
			RequiredContribution: requiredContribution,
			SuccessRate:         successProbability,
		},
	}, nil
}

func buildProbabilityCurve(finalValues []float64) []ProbabilityPoint {
	if len(finalValues) == 0 {
		return nil
	}
	minVal := finalValues[0]
	maxVal := finalValues[0]
	for _, v := range finalValues {
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	if maxVal == minVal {
		return []ProbabilityPoint{{Amount: math.Round(minVal), Probability: 1}}
	}
	binCount := 50
	binWidth := (maxVal - minVal) / float64(binCount)
	bins := make([]ProbabilityPoint, binCount)
	for i := 0; i < binCount; i++ {
		bins[i] = ProbabilityPoint{
			Amount:      math.Round(minVal + (float64(i)+0.5)*binWidth),
			Probability: 0,
		}
	}
	for _, v := range finalValues {
		idx := int((v - minVal) / binWidth)
		if idx >= binCount {
			idx = binCount - 1
		}
		if idx < 0 {
			idx = 0
		}
		bins[idx].Probability++
	}
	total := float64(len(finalValues))
	for i := range bins {
		bins[i].Probability /= total
	}
	return bins
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
		result = append(result, OptimalPathPoint{
			Year:   y,
			Median: mathutil.Percentile(values, 0.5),
			P10:    mathutil.Percentile(values, 0.1),
			P90:    mathutil.Percentile(values, 0.9),
		})
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
