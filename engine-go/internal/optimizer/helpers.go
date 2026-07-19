package optimizer

import (
	"math"
	"math/rand"
)

// covariance 计算两个序列的样本协方差
func covariance(x, y []float64) float64 {
	n := len(x)
	if n == 0 {
		return 0
	}
	meanX := 0.0
	meanY := 0.0
	for i := 0; i < n; i++ {
		meanX += x[i]
		meanY += y[i]
	}
	meanX /= float64(n)
	meanY /= float64(n)

	cov := 0.0
	for i := 0; i < n; i++ {
		cov += (x[i] - meanX) * (y[i] - meanY)
	}
	return cov / float64(n-1)
}

// portfolioMetrics 计算组合的收益、波动率、夏普比
func portfolioMetrics(w, mu []float64, sigma [][]float64) (float64, float64, float64) {
	ret := 0.0
	for i := range mu {
		ret += w[i] * mu[i]
	}

	wSigma := denseMulVec(sigma, w)
	variance := 0.0
	for i := range w {
		variance += w[i] * wSigma[i]
	}
	vol := math.Sqrt(math.Max(0, variance))

	sharpe := 0.0
	if vol > 1e-10 {
		sharpe = (ret - riskFreeRate) / vol
	}

	return ret, vol, sharpe
}

// satisfiesConstraints 检查权重是否满足约束
func satisfiesConstraints(w []float64, c Constraints) bool {
	for _, v := range w {
		if v < c.MinWeight-1e-10 || v > c.MaxWeight+1e-10 {
			return false
		}
	}
	return true
}

// clipOpts controls clipAndNormalize behavior.
type clipOpts struct {
	maxIter  int  // 1 = single pass (clipWeights); >1 = iterate until constraints satisfied (projectWeights)
	absCheck bool // true: |sum|<1e-15 -> uniform (projectWeights); false: sum<=1e-15 -> uniform (clipWeights)
}

// clipAndNormalize clips weights to [c.MinWeight, c.MaxWeight] and normalizes to sum=1.
// When opts.maxIter > 1, repeats clip+normalize until constraints are satisfied or maxIter reached.
// Returns uniform weights when sum is near zero (per opts.absCheck semantics).
func clipAndNormalize(w []float64, c Constraints, opts clipOpts) []float64 {
	n := len(w)
	result := make([]float64, n)
	copy(result, w)

	for i := 0; i < opts.maxIter; i++ {
		for j := range result {
			result[j] = math.Max(c.MinWeight, math.Min(c.MaxWeight, result[j]))
		}
		sumW := 0.0
		for _, v := range result {
			sumW += v
		}
		var returnUniform bool
		if opts.absCheck {
			returnUniform = math.Abs(sumW) < 1e-15
		} else {
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

// projectWeights 投影权重到约束可行域
//
// 企业理由：投影梯度法需要将权重投影到 [minW, maxW] 且和为1的可行域。
// 交替执行裁剪和归一化直到收敛。
func projectWeights(w []float64, c Constraints) []float64 {
	return clipAndNormalize(w, c, clipOpts{maxIter: 100, absCheck: true})
}

// clipWeights 裁剪权重到约束范围并归一化
func clipWeights(w []float64, c Constraints) []float64 {
	return clipAndNormalize(w, c, clipOpts{maxIter: 1, absCheck: false})
}

// isValidPortfolio 检查权重是否构成有效组合（非负、和≈1）
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

// makeWeightMap 将权重数组转换为 ticker->weight 映射
func makeWeightMap(tickers []string, weights []float64) map[string]float64 {
	m := make(map[string]float64, len(tickers))
	for i, t := range tickers {
		m[t] = weights[i]
	}
	return m
}

// randomSearch 随机搜索回退
//
// 企业理由：闭式解失败时（如矩阵奇异），随机搜索保证总有结果返回。
// 生成大量随机权重组合，取目标最优者。
func randomSearch(mu []float64, sigma [][]float64, c Constraints, objective string, numIter int) []float64 {
	n := len(mu)
	bestWeights := make([]float64, n)
	for i := range bestWeights {
		bestWeights[i] = 1.0 / float64(n)
	}
	bestScore := math.Inf(-1)

	// RNG is not concurrency-safe; wrap with sync.Mutex if called from multiple goroutines.
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

// randomWeights 生成满足约束的随机权重
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
		remaining -= weights[i]
		if remaining <= 0 {
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

	sumW := 0.0
	for _, w := range weights {
		sumW += w
	}
	if sumW > 0 {
		for i := range weights {
			weights[i] /= sumW
		}
	}

	return weights
}
