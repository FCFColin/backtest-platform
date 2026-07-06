// Package optimizer 提供投资组合优化和有效前沿计算。
//
// 企业理由（T-ARCH-2.4）：前端需要根据历史数据自动推荐最优资产配置，
// 并可视化风险-收益权衡曲线。纯 Go 标准库实现，不依赖 gonum 等第三方
// 数值库，降低依赖复杂度。权衡：对于 N<=15 的组合规模，子集枚举法
// 可保证全局最优；N>15 时退化为近似解，但实际投资组合很少超过 15 只。
package optimizer

import (
	"fmt"
	"math"
	"sort"
)

const (
	riskFreeRate       = 0.02
	tradingDaysPerYear = 252
	defaultIterations  = 10000
	defaultFrontierPts = 20
	regStart           = 1e-8
	regMaxAttempts     = 20
	projIterations     = 500
	subsetLimit        = 15
)

// ============================================================
// 请求/响应类型
// ============================================================

// OptimizeRequest 组合优化请求
type OptimizeRequest struct {
	Tickers       []string                      `json:"tickers"`
	PriceData     map[string]map[string]float64 `json:"priceData"`
	Objective     string                        `json:"objective"`
	Constraints   Constraints                   `json:"constraints"`
	NumIterations int                           `json:"numIterations"`
}

// Constraints 优化约束条件
type Constraints struct {
	MinWeight float64 `json:"minWeight"`
	MaxWeight float64 `json:"maxWeight"`
}

// OptimizeResponse 组合优化响应
type OptimizeResponse struct {
	OptimalWeights     map[string]float64 `json:"optimalWeights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}

// FrontierRequest 有效前沿请求
type FrontierRequest struct {
	Tickers   []string                      `json:"tickers"`
	PriceData map[string]map[string]float64 `json:"priceData"`
	NumPoints int                           `json:"numPoints"`
}

// FrontierResponse 有效前沿响应
type FrontierResponse struct {
	Frontier []FrontierPoint `json:"frontier"`
}

// FrontierPoint 有效前沿上的一个点
type FrontierPoint struct {
	Weights            map[string]float64 `json:"weights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}

// ============================================================
// 公开入口函数
// ============================================================

// Optimize 执行组合优化，是优化模块的主入口
func Optimize(req OptimizeRequest) (*OptimizeResponse, error) {
	if len(req.Tickers) == 0 {
		return nil, fmt.Errorf("tickers 不能为空")
	}
	if req.NumIterations <= 0 {
		req.NumIterations = defaultIterations
	}
	if req.Constraints.MinWeight < 0 {
		req.Constraints.MinWeight = 0
	}
	if req.Constraints.MaxWeight <= 0 {
		req.Constraints.MaxWeight = 1
	}

	mu, sigma, err := computeReturnCovariance(req.Tickers, req.PriceData)
	if err != nil {
		return nil, err
	}

	sigma = ensurePositiveDefinite(sigma)

	var weights []float64
	switch req.Objective {
	case "minVolatility":
		weights = optimizeMinVolatility(mu, sigma, req.Constraints, req.NumIterations)
	case "maxSharpe":
		weights = optimizeMaxSharpe(mu, sigma, req.Constraints, req.NumIterations)
	case "maxReturn":
		weights = optimizeMaxReturn(mu, req.Constraints)
	default:
		return nil, fmt.Errorf("不支持的优化目标: %s", req.Objective)
	}

	ret, vol, sharpe := portfolioMetrics(weights, mu, sigma)
	weightMap := makeWeightMap(req.Tickers, weights)

	return &OptimizeResponse{
		OptimalWeights:     weightMap,
		ExpectedReturn:     ret,
		ExpectedVolatility: vol,
		SharpeRatio:        sharpe,
	}, nil
}

// ComputeEfficientFrontier 计算有效前沿
func ComputeEfficientFrontier(req FrontierRequest) (*FrontierResponse, error) {
	if len(req.Tickers) == 0 {
		return nil, fmt.Errorf("tickers 不能为空")
	}
	if req.NumPoints <= 0 {
		req.NumPoints = defaultFrontierPts
	}

	mu, sigma, err := computeReturnCovariance(req.Tickers, req.PriceData)
	if err != nil {
		return nil, err
	}
	sigma = ensurePositiveDefinite(sigma)

	constraints := Constraints{MinWeight: 0, MaxWeight: 1}

	wMinVol := optimizeMinVolatility(mu, sigma, constraints, defaultIterations)
	retMinVol, _, _ := portfolioMetrics(wMinVol, mu, sigma)

	wMaxRet := optimizeMaxReturn(mu, constraints)
	retMaxRet, _, _ := portfolioMetrics(wMaxRet, mu, sigma)

	minRet := retMinVol
	maxRet := retMaxRet
	if maxRet <= minRet {
		maxRet = minRet + 0.01
	}

	frontier := make([]FrontierPoint, 0, req.NumPoints)
	for i := 0; i < req.NumPoints; i++ {
		targetRet := minRet + (maxRet-minRet)*float64(i)/float64(req.NumPoints-1)
		w := solveFrontierPoint(mu, sigma, targetRet, constraints)
		ret, vol, sharpe := portfolioMetrics(w, mu, sigma)
		frontier = append(frontier, FrontierPoint{
			Weights:            makeWeightMap(req.Tickers, w),
			ExpectedReturn:     ret,
			ExpectedVolatility: vol,
			SharpeRatio:        sharpe,
		})
	}

	return &FrontierResponse{Frontier: frontier}, nil
}

// ============================================================
// 收益率与协方差计算
// ============================================================

// collectAlignedDates 收集所有资产都有数据的对齐日期列表
func collectAlignedDates(tickers []string, priceData map[string]map[string]float64) ([]string, error) {
	dateSet := make(map[string]bool)
	for _, t := range tickers {
		for d := range priceData[t] {
			dateSet[d] = true
		}
	}
	if len(dateSet) == 0 {
		return nil, fmt.Errorf("价格数据为空")
	}

	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	alignedDates := make([]string, 0, len(dates))
	for _, d := range dates {
		allPresent := true
		for _, t := range tickers {
			if _, ok := priceData[t][d]; !ok {
				allPresent = false
				break
			}
		}
		if allPresent {
			alignedDates = append(alignedDates, d)
		}
	}
	if len(alignedDates) < 2 {
		return nil, fmt.Errorf("对齐后交易日不足2天，无法计算收益率")
	}

	return alignedDates, nil
}

// computeReturnCovariance 计算年化收益率向量和协方差矩阵
func computeReturnCovariance(tickers []string, priceData map[string]map[string]float64) ([]float64, [][]float64, error) {
	n := len(tickers)

	alignedDates, err := collectAlignedDates(tickers, priceData)
	if err != nil {
		return nil, nil, err
	}

	m := len(alignedDates)
	prices := make([][]float64, n)
	for i, t := range tickers {
		prices[i] = make([]float64, m)
		for j, d := range alignedDates {
			prices[i][j] = priceData[t][d]
		}
	}

	dailyReturns := make([][]float64, n)
	for i := 0; i < n; i++ {
		dailyReturns[i] = make([]float64, m-1)
		for j := 0; j < m-1; j++ {
			if prices[i][j] == 0 {
				dailyReturns[i][j] = 0
			} else {
				dailyReturns[i][j] = prices[i][j+1]/prices[i][j] - 1
			}
		}
	}

	mu := make([]float64, n)
	for i := 0; i < n; i++ {
		cumProd := 1.0
		for _, r := range dailyReturns[i] {
			cumProd *= (1 + r)
		}
		mu[i] = math.Pow(cumProd, float64(tradingDaysPerYear)/float64(len(dailyReturns[i]))) - 1
	}

	cov := make([][]float64, n)
	for i := 0; i < n; i++ {
		cov[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := i; j < n; j++ {
			covVal := covariance(dailyReturns[i], dailyReturns[j]) * float64(tradingDaysPerYear)
			cov[i][j] = covVal
			cov[j][i] = covVal
		}
	}

	return mu, cov, nil
}

// ============================================================
// 有效前沿点求解
// ============================================================

// computeLagrangeCoeffs 计算 Lagrange 系统系数 a=1'Σ^(-1)1, b=1'Σ^(-1)μ, c=μ'Σ^(-1)μ
func computeLagrangeCoeffs(sigmaInvOnes, sigmaInvMu, mu []float64) (float64, float64, float64) {
	var a, b, cc float64
	for i := range mu {
		a += sigmaInvOnes[i]
		b += sigmaInvMu[i]
		cc += mu[i] * sigmaInvMu[i]
	}
	return a, b, cc
}

// solveFrontierPoint 求解有效前沿上的一个点
func solveFrontierPoint(mu []float64, sigma [][]float64, targetRet float64, c Constraints) []float64 {
	n := len(mu)
	sigmaInv, err := invertMatrix(sigma)
	if err != nil {
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}

	ones := make([]float64, n)
	for i := range ones {
		ones[i] = 1.0
	}

	sigmaInvOnes := matVecMul(sigmaInv, ones)
	sigmaInvMu := matVecMul(sigmaInv, mu)

	a, b, cc := computeLagrangeCoeffs(sigmaInvOnes, sigmaInvMu, mu)

	det := a*cc - b*b
	if math.Abs(det) < 1e-15 {
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}
	lambda1 := (-cc + b*targetRet) / det
	lambda2 := (b - a*targetRet) / det

	weights := make([]float64, n)
	for i := 0; i < n; i++ {
		weights[i] = lambda1*sigmaInvOnes[i] + lambda2*sigmaInvMu[i]
	}

	for _, w := range weights {
		if w < -1e-10 {
			return linearInterpolationFallback(mu, sigma, targetRet, c)
		}
	}

	sumW := 0.0
	for _, w := range weights {
		sumW += w
	}
	if math.Abs(sumW) > 1e-15 {
		for i := range weights {
			weights[i] /= sumW
		}
	}

	if satisfiesConstraints(weights, c) {
		return weights
	}
	return clipWeights(weights, c)
}

// linearInterpolationFallback 线性插值回退
//
// 企业理由：当 Lagrange 解产生负权重时，在可行组合之间线性插值，
// 保证前沿点始终在可行域内。
func linearInterpolationFallback(mu []float64, sigma [][]float64, targetRet float64, c Constraints) []float64 {
	wMinVol := optimizeMinVolatility(mu, sigma, c, defaultIterations)
	wMaxRet := optimizeMaxReturn(mu, c)

	retMin, _, _ := portfolioMetrics(wMinVol, mu, sigma)
	retMax, _, _ := portfolioMetrics(wMaxRet, mu, sigma)

	if math.Abs(retMax-retMin) < 1e-15 {
		return wMinVol
	}

	t := (targetRet - retMin) / (retMax - retMin)
	t = math.Max(0, math.Min(1, t))

	n := len(mu)
	weights := make([]float64, n)
	for i := 0; i < n; i++ {
		weights[i] = (1-t)*wMinVol[i] + t*wMaxRet[i]
	}
	return weights
}
