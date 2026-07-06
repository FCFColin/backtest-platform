package optimizer

import (
	"fmt"
	"math"
	"sort"
)

// ============================================================
// 共享优化子程序
// ============================================================

// tangentPortfolio 计算切线组合权重 w ∝ Σ^(-1)(μ - rf*1)
//
// 企业理由：切线组合是最大夏普比组合的无约束解，在有效前沿理论中
// 是无风险利率下资本配置线与有效前沿的切点。
func tangentPortfolio(mu []float64, sigmaInv [][]float64) ([]float64, error) {
	n := len(mu)
	excess := make([]float64, n)
	for i := range excess {
		excess[i] = mu[i] - riskFreeRate
	}
	rawW := matVecMul(sigmaInv, excess)

	sumRaw := 0.0
	for _, v := range rawW {
		sumRaw += v
	}
	if math.Abs(sumRaw) < 1e-15 {
		return nil, fmt.Errorf("tangent portfolio: denominator is zero")
	}
	for i := range rawW {
		rawW[i] /= sumRaw
	}
	return rawW, nil
}

// closedFormMinVolatility 计算闭式最小波动率解 w = Σ^(-1)*1/(1'Σ^(-1)*1)
func closedFormMinVolatility(sigmaInv [][]float64) ([]float64, error) {
	n := len(sigmaInv)
	ones := make([]float64, n)
	for i := range ones {
		ones[i] = 1.0
	}
	sigmaInvOnes := matVecMul(sigmaInv, ones)
	denom := 0.0
	for _, v := range sigmaInvOnes {
		denom += v
	}
	if math.Abs(denom) < 1e-15 {
		return nil, fmt.Errorf("closed form: denominator is zero")
	}
	weights := make([]float64, n)
	for i := range weights {
		weights[i] = sigmaInvOnes[i] / denom
	}
	return weights, nil
}

// ============================================================
// 优化算法
// ============================================================

// optimizeMinVolatility 最小波动率优化
//
// 企业理由：保守型投资者希望最小化组合波动。闭式解 w=Σ^(-1)*1/(1'Σ^(-1)*1)
// 在无约束时全局最优；有约束时用投影梯度法逼近。
func optimizeMinVolatility(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	n := len(mu)
	sigmaInv, err := invertMatrix(sigma)
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

	// 投影梯度法：Lipschitz 常数取最大特征值（保证收敛）
	lipConst := maxEigenvalue(sigma)
	if lipConst <= 0 {
		lipConst = 1.0
	}
	step := 1.0 / lipConst

	w := make([]float64, n)
	copy(w, weights)
	for iter := 0; iter < projIterations; iter++ {
		grad := matVecMul(sigma, w)
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

// optimizeMaxSharpe 最大夏普比优化
//
// 企业理由：风险调整收益是投资决策的核心指标。N<=15 时子集枚举
// 保证全局最优；N>15 时闭式切线组合+裁剪为近似解。
func optimizeMaxSharpe(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	n := len(mu)
	if n <= subsetLimit {
		return optimizeMaxSharpeSubset(mu, sigma, c, numIter)
	}
	return optimizeMaxSharpeClosed(mu, sigma, c, numIter)
}

// optimizeMaxSharpeSubset 子集枚举法求最大夏普比（N<=15）
//
// 企业理由：枚举所有非空子集，对每个子集计算无约束切线组合，
// 取全局最优。2^15=32768 个子集，计算量可接受。
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
		for i, idx := range indices {
			subMu[i] = mu[idx]
		}
		subSigma := make([][]float64, k)
		for i := 0; i < k; i++ {
			subSigma[i] = make([]float64, k)
			for j := 0; j < k; j++ {
				subSigma[i][j] = sigma[indices[i]][indices[j]]
			}
		}

		subSigmaInv, err := invertMatrix(subSigma)
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

// optimizeMaxSharpeClosed 闭式切线组合法（N>15）
//
// 企业理由：N>15 时子集枚举不可行（2^16=65536 已较大），
// 退化为闭式解+裁剪，近似程度可接受。
func optimizeMaxSharpeClosed(mu []float64, sigma [][]float64, c Constraints, numIter int) []float64 {
	sigmaInv, err := invertMatrix(sigma)
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

	clipped := clipWeights(rawW, c)
	if isValidPortfolio(clipped) {
		return clipped
	}
	return randomSearch(mu, sigma, c, "maxSharpe", numIter)
}

// optimizeMaxReturn 最大收益优化（贪心法）
//
// 企业理由：激进型投资者只关心收益。按预期收益降序分配最大权重，
// 简单高效，无需矩阵运算。
func optimizeMaxReturn(mu []float64, c Constraints) []float64 {
	n := len(mu)
	indices := make([]int, n)
	for i := range indices {
		indices[i] = i
	}
	sort.Slice(indices, func(i, j int) bool {
		return mu[indices[i]] > mu[indices[j]]
	})

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
