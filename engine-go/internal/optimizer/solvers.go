package optimizer

import (
	"fmt"
	"math"
	"sort"
)

func normalizedSol(name string, v []float64) ([]float64, error) {
	sum := 0.0
	for _, x := range v {
		sum += x
	}
	if math.Abs(sum) < 1e-15 {
		return nil, fmt.Errorf("%s: denominator is zero", name)
	}
	for i := range v {
		v[i] /= sum
	}
	return v, nil
}
func tangentPortfolio(mu []float64, sigmaInv [][]float64) ([]float64, error) {
	excess := make([]float64, len(mu))
	for i := range excess {
		excess[i] = mu[i] - riskFreeRate
	}
	return normalizedSol("tangent portfolio", denseMulVec(sigmaInv, excess))
}
func closedFormMinVolatility(sigmaInv [][]float64) ([]float64, error) {
	ones := make([]float64, len(sigmaInv))
	for i := range ones {
		ones[i] = 1.0
	}
	return normalizedSol("closed form", denseMulVec(sigmaInv, ones))
}
func optimizeMinVolatility(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	n := len(mu)
	sigmaInv, err := invertDense(sigma)
	if err != nil {
		return randomSearch(mu, sigma, c, "minVolatility", numIter)
	}
	weights, err := closedFormMinVolatility(sigmaInv)
	if err != nil {
		return randomSearch(mu, sigma, c, "minVolatility", numIter)
	}
	if satisfiesConstraints(weights, c) {
		return weights
	}
	lipConst := largestEigenvalue(sigma)
	if lipConst <= 0 {
		lipConst = 1.0
	}
	// ∇(wᵀΣw) = 2Σw 的 Lipschitz 常数为 2·λmax，步长取 1/L 保证投影梯度收敛
	step := 1.0 / (2.0 * lipConst)
	w := make([]float64, n)
	copy(w, weights)
	for iter := 0; iter < projIterations; iter++ {
		grad := denseMulVec(sigma, w)
		for i := range w {
			w[i] -= step * 2 * grad[i]
		}
		w = projectWeights(w, c)
	}
	if isValidPortfolio(w) {
		return w
	}
	return randomSearch(mu, sigma, c, "minVolatility", numIter)
}
func optimizeMaxSharpe(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	n := len(mu)
	if n <= subsetLimit {
		return optimizeMaxSharpeSubset(mu, sigma, c, numIter)
	}
	return optimizeMaxSharpeClosed(mu, sigma, c, numIter)
}
func optimizeMaxSharpeSubset(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	n := len(mu)
	totalSubsets := 1 << n
	bestSharpe := math.Inf(-1)
	bestWeights := make([]float64, n)
	for i := range bestWeights {
		bestWeights[i] = 1.0 / float64(n)
	}
	for mask := 1; mask < totalSubsets; mask++ {
		indices := make([]int, 0, n)
		for i := 0; i < n; i++ {
			if mask&(1<<i) != 0 {
				indices = append(indices, i)
			}
		}
		k := len(indices)
		subMu := make([]float64, k)
		subSigma := make([][]float64, k)
		for i, idx := range indices {
			subMu[i] = mu[idx]
			subSigma[i] = make([]float64, k)
			for j := 0; j < k; j++ {
				subSigma[i][j] = sigma[idx][indices[j]]
			}
		}
		subSigmaInv, err := invertDense(subSigma)
		if err != nil {
			continue
		}
		rawW, err := tangentPortfolio(subMu, subSigmaInv)
		if err != nil {
			continue
		}
		fullW := make([]float64, n)
		for i, idx := range indices {
			fullW[idx] = rawW[i]
		}
		if !satisfiesConstraints(fullW, c) {
			fullW = clipWeights(fullW, c)
		}
		if !isValidPortfolio(fullW) {
			continue
		}
		_, _, sharpe := portfolioMetrics(fullW, mu, sigma)
		if sharpe > bestSharpe {
			bestSharpe = sharpe
			bestWeights = fullW
		}
	}
	if bestSharpe > math.Inf(-1) {
		return bestWeights
	}
	return randomSearch(mu, sigma, c, "maxSharpe", numIter)
}
func optimizeMaxSharpeClosed(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	sigmaInv, err := invertDense(sigma)
	if err != nil {
		return randomSearch(mu, sigma, c, "maxSharpe", numIter)
	}
	rawW, err := tangentPortfolio(mu, sigmaInv)
	if err != nil {
		return randomSearch(mu, sigma, c, "maxSharpe", numIter)
	}
	if satisfiesConstraints(rawW, c) {
		return rawW
	}
	// clipWeights 单次 clip+归一化可能把权重再次推过 MaxWeight；projectWeights 迭代至满足约束
	clipped := projectWeights(rawW, c)
	if isValidPortfolio(clipped) {
		return clipped
	}
	return randomSearch(mu, sigma, c, "maxSharpe", numIter)
}
func optimizeMaxReturn(mu []float64, c Constraints) []float64 {
	n := len(mu)
	indices := make([]int, n)
	for i := range indices {
		indices[i] = i
	}
	sort.Slice(indices, func(i, j int) bool { return mu[indices[i]] > mu[indices[j]] })
	weights := make([]float64, n)
	remaining := 1.0
	for _, idx := range indices {
		alloc := math.Min(c.MaxWeight, remaining)
		if alloc < c.MinWeight && remaining > c.MinWeight {
			alloc = c.MinWeight
		}
		if alloc > remaining {
			alloc = remaining
		}
		weights[idx] = alloc
		remaining -= alloc
		if remaining <= 1e-10 {
			break
		}
	}
	if remaining > 1e-10 {
		for i := range weights {
			space := c.MaxWeight - weights[i]
			if space > 0 {
				add := math.Min(space, remaining)
				weights[i] += add
				remaining -= add
				if remaining <= 1e-10 {
					break
				}
			}
		}
	}
	return weights
}
