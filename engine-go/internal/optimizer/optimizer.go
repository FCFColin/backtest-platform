// Package optimizer 提供投资组合优化和有效前沿计算。
package optimizer

import (
	"context"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"fmt"
	"gonum.org/v1/gonum/mat"
	"math"
	"math/rand"
	"slices"
)

const (
	riskFreeRate       = engineutil.RiskFreeRate
	tradingDaysPerYear = engineutil.TradingDaysPerYear
	defaultIterations  = 10000
	defaultFrontierPts = 20
	regStart           = 1e-8
	regMaxAttempts     = 20
	projIterations     = 500
	subsetLimit        = 15
)

type OptimizeRequest struct {
	Tickers       []string                      `json:"tickers"`
	PriceData     map[string]map[string]float64 `json:"priceData"`
	Objective     string                        `json:"objective"`
	Constraints   Constraints                   `json:"constraints"`
	NumIterations int                           `json:"numIterations"`
}
type Constraints struct {
	MinWeight float64 `json:"minWeight"`
	MaxWeight float64 `json:"maxWeight"`
}
type OptimizeResponse struct {
	OptimalWeights     map[string]float64 `json:"optimalWeights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}
type FrontierRequest struct {
	Tickers   []string                      `json:"tickers"`
	PriceData map[string]map[string]float64 `json:"priceData"`
	NumPoints int                           `json:"numPoints"`
}
type FrontierResponse struct {
	Frontier []FrontierPoint `json:"frontier"`
}
type FrontierPoint struct {
	Weights            map[string]float64 `json:"weights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}

func Optimize(ctx context.Context, req OptimizeRequest) (*OptimizeResponse, error) {
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
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	sigma = ensurePD(sigma)
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
	return &OptimizeResponse{OptimalWeights: makeWeightMap(req.Tickers, weights), ExpectedReturn: ret, ExpectedVolatility: vol, SharpeRatio: sharpe}, nil
}
func ComputeEfficientFrontier(ctx context.Context, req FrontierRequest) (*FrontierResponse, error) {
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
	sigma = ensurePD(sigma)
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
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		targetRet := minRet + (maxRet-minRet)*float64(i)/float64(req.NumPoints-1)
		w := solveFrontierPoint(mu, sigma, targetRet, constraints)
		ret, vol, sharpe := portfolioMetrics(w, mu, sigma)
		frontier = append(frontier, FrontierPoint{Weights: makeWeightMap(req.Tickers, w), ExpectedReturn: ret, ExpectedVolatility: vol, SharpeRatio: sharpe})
	}
	return &FrontierResponse{Frontier: frontier}, nil
}
func computeReturnCovariance(tickers []string, priceData map[string]map[string]float64) ([]float64, [][]float64, error) {
	n := len(tickers)
	alignedDates := engineutil.AlignDates(tickers, priceData)
	if len(alignedDates) < 2 {
		for _, t := range tickers {
			if len(priceData[t]) > 0 {
				return nil, nil, fmt.Errorf("对齐后交易日不足2天，无法计算收益率")
			}
		}
		return nil, nil, fmt.Errorf("价格数据为空")
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
		dailyReturns[i] = mathutil.DailyReturnsWithZeros(prices[i])
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
			covVal := mathutil.Covariance(dailyReturns[i], dailyReturns[j]) * float64(tradingDaysPerYear)
			cov[i][j] = covVal
			cov[j][i] = covVal
		}
	}
	return mu, cov, nil
}
func computeLagrangeCoeffs(sigmaInvOnes, sigmaInvMu, mu []float64) (a, b, cc float64) {
	for i := range mu {
		a += sigmaInvOnes[i]
		b += sigmaInvMu[i]
		cc += mu[i] * sigmaInvMu[i]
	}
	return
}
func solveFrontierPoint(mu []float64, sigma [][]float64, targetRet float64, c Constraints) []float64 {
	n := len(mu)
	sigmaInv, err := invertDense(sigma)
	if err != nil {
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}
	ones := make([]float64, n)
	for i := range ones {
		ones[i] = 1.0
	}
	sigmaInvOnes := denseMulVec(sigmaInv, ones)
	sigmaInvMu := denseMulVec(sigmaInv, mu)
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
	sumW := mathutil.Sum(weights)
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
func linearInterpolationFallback(mu []float64, sigma [][]float64, targetRet float64, c Constraints) []float64 {
	wMinVol := optimizeMinVolatility(mu, sigma, c, defaultIterations)
	wMaxRet := optimizeMaxReturn(mu, c)
	retMin, _, _ := portfolioMetrics(wMinVol, mu, sigma)
	retMax, _, _ := portfolioMetrics(wMaxRet, mu, sigma)
	if math.Abs(retMax-retMin) < 1e-15 {
		return wMinVol
	}
	t := math.Max(0, math.Min(1, (targetRet-retMin)/(retMax-retMin)))
	weights := make([]float64, len(mu))
	for i := range mu {
		weights[i] = (1-t)*wMinVol[i] + t*wMaxRet[i]
	}
	return weights
}
func portfolioMetrics(w, mu []float64, sigma [][]float64) (ret, vol, sharpe float64) {
	for i := range mu {
		ret += w[i] * mu[i]
	}
	wSigma := denseMulVec(sigma, w)
	variance := 0.0
	for i := range w {
		variance += w[i] * wSigma[i]
	}
	vol = math.Sqrt(math.Max(0, variance))
	if vol > 1e-10 {
		sharpe = (ret - riskFreeRate) / vol
	}
	return
}
func satisfiesConstraints(w []float64, c Constraints) bool {
	for _, v := range w {
		if v < c.MinWeight-1e-10 || v > c.MaxWeight+1e-10 {
			return false
		}
	}
	return true
}

type clipOpts struct {
	maxIter  int  // 1 = single pass (clipWeights); >1 = iterate until constraints satisfied (projectWeights)
	absCheck bool // true: |sum|<1e-15 -> uniform (projectWeights); false: sum<=1e-15 -> uniform (clipWeights)
}

func clipAndNormalize(w []float64, c Constraints, opts clipOpts) []float64 {
	n := len(w)
	result := make([]float64, n)
	copy(result, w)
	for i := 0; i < opts.maxIter; i++ {
		for j := range result {
			result[j] = math.Max(c.MinWeight, math.Min(c.MaxWeight, result[j]))
		}
		sumW := mathutil.Sum(result)
		returnUniform := math.Abs(sumW) < 1e-15
		if !opts.absCheck {
			returnUniform = sumW <= 1e-15
		}
		if returnUniform {
			for j := range result {
				result[j] = 1.0 / float64(n)
			}
			return result
		}
		for j := range result {
			result[j] /= sumW
		}
		if opts.maxIter > 1 && satisfiesConstraints(result, c) {
			break
		}
	}
	return result
}
func projectWeights(w []float64, c Constraints) []float64 {
	return clipAndNormalize(w, c, clipOpts{maxIter: 100, absCheck: true})
}
func clipWeights(w []float64, c Constraints) []float64 {
	return clipAndNormalize(w, c, clipOpts{maxIter: 1, absCheck: false})
}
func isValidPortfolio(w []float64) bool {
	sumW := 0.0
	for _, v := range w {
		if v < -1e-6 {
			return false
		}
		sumW += v
	}
	return math.Abs(sumW-1.0) < 0.01
}
func makeWeightMap(tickers []string, weights []float64) map[string]float64 {
	m := make(map[string]float64, len(tickers))
	for i, t := range tickers {
		m[t] = weights[i]
	}
	return m
}
func randomSearch(mu []float64, sigma [][]float64, c Constraints, objective string, numIter int) []float64 {
	n := len(mu)
	bestWeights := make([]float64, n)
	for i := range bestWeights {
		bestWeights[i] = 1.0 / float64(n)
	}
	bestScore := math.Inf(-1)
	rng := rand.New(rand.NewSource(42))
	for iter := 0; iter < numIter; iter++ {
		w := randomWeights(n, c, rng)
		ret, vol, sharpe := portfolioMetrics(w, mu, sigma)
		var score float64
		switch objective {
		case "maxSharpe":
			score = sharpe
		case "minVolatility":
			score = -vol
		case "maxReturn":
			score = ret
		default:
			score = sharpe
		}
		if score > bestScore {
			bestScore = score
			copy(bestWeights, w)
		}
	}
	return bestWeights
}
func randomWeights(n int, c Constraints, rng *rand.Rand) []float64 {
	weights := make([]float64, n)
	remaining := 1.0
	for i := 0; i < n-1; i++ {
		maxAlloc := math.Min(c.MaxWeight, remaining)
		minAlloc := math.Max(c.MinWeight, 0)
		if maxAlloc < minAlloc {
			weights[i] = minAlloc
		} else {
			weights[i] = minAlloc + rng.Float64()*(maxAlloc-minAlloc)
		}
		if remaining -= weights[i]; remaining <= 0 {
			remaining = 0
			break
		}
	}
	weights[n-1] = remaining
	if weights[n-1] > c.MaxWeight {
		weights[n-1] = c.MaxWeight
	}
	if weights[n-1] < c.MinWeight && remaining > c.MinWeight {
		weights[n-1] = c.MinWeight
	}
	sumW := mathutil.Sum(weights)
	if sumW > 0 {
		for i := range weights {
			weights[i] /= sumW
		}
	}
	return weights
}
func flatten(a [][]float64) []float64 {
	flat := make([]float64, 0, len(a)*len(a[0]))
	for _, row := range a {
		flat = append(flat, row...)
	}
	return flat
}
func invertDense(a [][]float64) ([][]float64, error) {
	n := len(a)
	if n == 0 {
		return nil, fmt.Errorf("矩阵为空")
	}
	m := mat.NewDense(n, n, flatten(a))
	var inv mat.Dense
	if err := inv.Inverse(m); err != nil {
		return nil, fmt.Errorf("矩阵奇异，无法求逆: %w", err)
	}
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, n)
		for j := 0; j < n; j++ {
			result[i][j] = inv.At(i, j)
		}
	}
	return result, nil
}
func denseMulVec(matrix [][]float64, vec []float64) []float64 {
	if len(matrix) == 0 {
		return nil
	}
	m := mat.NewDense(len(matrix), len(vec), flatten(matrix))
	v := mat.NewVecDense(len(vec), vec)
	var result mat.VecDense
	result.MulVec(m, v)
	return result.RawVector().Data
}
func largestEigenvalue(a [][]float64) float64 {
	if len(a) == 0 {
		return 0
	}
	var es mat.EigenSym
	if !es.Factorize(mat.NewSymDense(len(a), flatten(a)), false) {
		return 0
	}
	if vals := es.Values(nil); len(vals) > 0 {
		return slices.Max(vals)
	}
	return 0
}
func ensurePD(sigma [][]float64) [][]float64 {
	reg := regStart
	for attempt := 0; attempt < regMaxAttempts; attempt++ {
		if isPD(sigma) {
			return sigma
		}
		result := cloneMatrix(sigma)
		for i := range sigma {
			result[i][i] += reg
		}
		sigma, reg = result, reg*10
	}
	return sigma
}
func isPD(a [][]float64) bool {
	if len(a) == 0 {
		return false
	}
	var chol mat.Cholesky
	return chol.Factorize(mat.NewSymDense(len(a), flatten(a)))
}
func cloneMatrix(a [][]float64) [][]float64 {
	n := len(a)
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, len(a[i]))
		copy(result[i], a[i])
	}
	return result
}
