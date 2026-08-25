package optimizer

import (
	"context"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"gonum.org/v1/gonum/stat"
	"math"
	"math/rand"
)

const (
	riskFreeRate       = engineutil.RiskFreeRate // U-2 backlog：贯通需 tangentPortfolio/portfolioMetrics 签名链改造（~120 行），模式参照 engine.CalcSharpeWithRF
	tradingDaysPerYear = engineutil.TradingDaysPerYear
	defaultIterations  = 10000
	maxIterations      = 200000
	defaultFrontierPts = 20
	maxFrontierPts     = 500
	regStart           = 1e-8
	regMaxAttempts     = 20
	projIterations     = 500
	subsetLimit        = 15
	// 协方差为 O(n²) 内存 + O(n³) 求逆，frontier 逐点重求逆；200 标的已覆盖真实组合并封顶最坏负载
	maxTickers = 200
)

func prepareInputs(tickers []string, priceData map[string]map[string]float64) ([]float64, [][]float64, error) {
	if len(tickers) == 0 {
		return nil, nil, engineutil.NewInputError("tickers 不能为空")
	}
	if len(tickers) > maxTickers {
		return nil, nil, engineutil.NewInputError("标的数 %d 超过上限 %d", len(tickers), maxTickers)
	}
	mu, sigma, err := computeReturnCovariance(tickers, priceData)
	if err != nil {
		return nil, nil, err
	}
	return mu, ensurePD(sigma), nil
}
func Optimize(ctx context.Context, req OptimizeRequest) (*OptimizeResponse, error) {
	req.NumIterations = engineutil.BoundedInt(req.NumIterations, defaultIterations, maxIterations)
	if req.Constraints.MinWeight < 0 {
		req.Constraints.MinWeight = 0
	}
	if req.Constraints.MaxWeight <= 0 {
		req.Constraints.MaxWeight = 1
	}
	if req.Constraints.MinWeight > req.Constraints.MaxWeight {
		return nil, engineutil.NewInputError("MinWeight 不能大于 MaxWeight")
	}
	if req.Constraints.MinWeight > 0 && req.Constraints.MinWeight*float64(len(req.Tickers)) > 1 {
		return nil, engineutil.NewInputError("最小权重×标的数总和超过 1，约束不可行")
	}
	mu, sigma, err := prepareInputs(req.Tickers, req.PriceData)
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	var weights []float64
	switch req.Objective {
	case "minVolatility":
		weights = optimizeMinVolatility(mu, sigma, req.Constraints, req.NumIterations)
	case "maxSharpe":
		weights = optimizeMaxSharpe(mu, sigma, req.Constraints, req.NumIterations)
	case "maxReturn":
		weights = optimizeMaxReturn(mu, req.Constraints)
	default:
		return nil, engineutil.NewInputError("不支持的优化目标: %s", req.Objective)
	}
	ret, vol, sharpe := portfolioMetrics(weights, mu, sigma)
	return &OptimizeResponse{OptimalWeights: makeWeightMap(req.Tickers, weights), ExpectedReturn: ret, ExpectedVolatility: vol, SharpeRatio: sharpe}, nil
}
func ComputeEfficientFrontier(ctx context.Context, req FrontierRequest) (*FrontierResponse, error) {
	req.NumPoints = max(2, engineutil.BoundedInt(req.NumPoints, defaultFrontierPts, maxFrontierPts))
	mu, sigma, err := prepareInputs(req.Tickers, req.PriceData)
	if err != nil {
		return nil, err
	}
	c := Constraints{MinWeight: 0, MaxWeight: 1}
	retMin, _, _ := portfolioMetrics(optimizeMinVolatility(mu, sigma, c, defaultIterations), mu, sigma)
	retMax, _, _ := portfolioMetrics(optimizeMaxReturn(mu, c), mu, sigma)
	if retMax <= retMin {
		retMax = retMin + 0.01
	}
	frontier := make([]FrontierPoint, 0, req.NumPoints)
	for i := 0; i < req.NumPoints; i++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		targetRet := retMin + (retMax-retMin)*float64(i)/float64(req.NumPoints-1)
		w := solveFrontierPoint(mu, sigma, targetRet, c)
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
				return nil, nil, engineutil.NewInputError("对齐后交易日不足2天，无法计算收益率")
			}
		}
		return nil, nil, engineutil.NewInputError("价格数据为空")
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
			covVal := stat.Covariance(dailyReturns[i], dailyReturns[j], nil) * float64(tradingDaysPerYear)
			cov[i][j] = covVal
			cov[j][i] = covVal
		}
	}
	return mu, cov, nil
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
	a, b, cc := 0.0, 0.0, 0.0
	for i := range mu {
		a += sigmaInvOnes[i]
		b += sigmaInvMu[i]
		cc += mu[i] * sigmaInvMu[i]
	}
	det := a*cc - b*b
	if math.Abs(det) < 1e-15 {
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}
	lambda1 := (cc - b*targetRet) / det
	lambda2 := (a*targetRet - b) / det
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
	maxIter  int
	absCheck bool
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
		if (opts.absCheck && math.Abs(sumW) < 1e-15) || (!opts.absCheck && sumW <= 1e-15) {
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
		_, vol, sharpe := portfolioMetrics(w, mu, sigma)
		var score float64
		switch objective {
		case "maxSharpe":
			score = sharpe
		case "minVolatility":
			score = -vol
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
	weights[n-1] = math.Max(c.MinWeight, math.Min(c.MaxWeight, remaining))
	sumW := mathutil.Sum(weights)
	if sumW > 0 {
		for i := range weights {
			weights[i] /= sumW
		}
	}
	return weights
}
