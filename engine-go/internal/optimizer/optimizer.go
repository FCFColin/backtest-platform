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
	"math/rand"
	"sort"
)

// ============================================================
// 常量
// ============================================================

const (
	riskFreeRate       = 0.02  // 无风险利率，与 statistics.go 保持一致
	tradingDaysPerYear = 252   // 年交易日数
	defaultIterations  = 10000 // 随机搜索默认迭代次数
	defaultFrontierPts = 20    // 有效前沿默认采样点数
	regStart           = 1e-8  // 正则化起始值
	regMaxAttempts     = 20    // 正则化最大尝试次数
	projIterations     = 500   // 投影迭代最大次数
	subsetLimit        = 15    // 子集枚举法的资产数上限
)

// ============================================================
// 请求/响应类型
// ============================================================

// OptimizeRequest 组合优化请求
//
// 企业理由：前端用户选择资产和优化目标后，后端返回最优权重配置。
// 支持三种目标：最大夏普比、最小波动率、最大收益。
type OptimizeRequest struct {
	Tickers       []string                        `json:"tickers"`
	PriceData     map[string]map[string]float64   `json:"priceData"`
	Objective     string                          `json:"objective"` // "maxSharpe" | "minVolatility" | "maxReturn"
	Constraints   Constraints                     `json:"constraints"`
	NumIterations int                             `json:"numIterations"`
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
//
// 企业理由：前端绘制风险-收益散点图，需要沿有效前沿均匀采样。
type FrontierRequest struct {
	Tickers   []string                       `json:"tickers"`
	PriceData map[string]map[string]float64  `json:"priceData"`
	NumPoints int                            `json:"numPoints"`
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
//
// 企业理由：统一入口处理请求校验、收益率/协方差计算、目标优化。
// 闭式解优先，失败时回退到随机搜索，保证总有结果返回。
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

	// 确保协方差矩阵正定
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
//
// 企业理由：前端需要绘制风险-收益权衡曲线，帮助用户直观理解
// 不同配置下的收益与波动关系，辅助投资决策。
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

	// 求最小波动率和最大收益组合，确定收益范围
	wMinVol := optimizeMinVolatility(mu, sigma, constraints, defaultIterations)
	retMinVol, _, _ := portfolioMetrics(wMinVol, mu, sigma)

	wMaxRet := optimizeMaxReturn(mu, constraints)
	retMaxRet, _, _ := portfolioMetrics(wMaxRet, mu, sigma)

	// 有效前沿的收益范围
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

// computeReturnCovariance 计算年化收益率向量和协方差矩阵
//
// 企业理由：这是所有优化算法的输入基础。对齐日期保证不同资产的
// 收益率在相同时间窗口上计算，避免数据不对齐导致的统计偏差。
func computeReturnCovariance(tickers []string, priceData map[string]map[string]float64) ([]float64, [][]float64, error) {
	n := len(tickers)

	// 收集所有日期并排序
	dateSet := make(map[string]bool)
	for _, t := range tickers {
		for d := range priceData[t] {
			dateSet[d] = true
		}
	}
	if len(dateSet) == 0 {
		return nil, nil, fmt.Errorf("价格数据为空")
	}
	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	// 只保留所有资产都有数据的日期（对齐）
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
		return nil, nil, fmt.Errorf("对齐后交易日不足2天，无法计算收益率")
	}

	// 构建价格矩阵：n 行 x m 列（n=资产数，m=天数）
	m := len(alignedDates)
	prices := make([][]float64, n)
	for i, t := range tickers {
		prices[i] = make([]float64, m)
		for j, d := range alignedDates {
			prices[i][j] = priceData[t][d]
		}
	}

	// 计算日收益率
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

	// 年化收益率 = 累积收益率的几何平均年化
	mu := make([]float64, n)
	for i := 0; i < n; i++ {
		cumProd := 1.0
		for _, r := range dailyReturns[i] {
			cumProd *= (1 + r)
		}
		mu[i] = math.Pow(cumProd, float64(tradingDaysPerYear)/float64(len(dailyReturns[i]))) - 1
	}

	// 日协方差矩阵 * 252 = 年化协方差矩阵
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

// ============================================================
// 正定性保证
// ============================================================

// ensurePositiveDefinite 确保矩阵正定，通过 Cholesky 分解检测
//
// 企业理由：闭式解需要矩阵求逆，非正定矩阵不可逆会导致计算失败。
// 逐步增加正则化项，最小化对原始数据的扰动。
func ensurePositiveDefinite(sigma [][]float64) [][]float64 {
	n := len(sigma)
	reg := regStart
	for attempt := 0; attempt < regMaxAttempts; attempt++ {
		if isPositiveDefinite(sigma) {
			return sigma
		}
		// 添加正则化项
		result := copyMatrix(sigma)
		for i := 0; i < n; i++ {
			result[i][i] += reg
		}
		sigma = result
		reg *= 10
	}
	return sigma
}

// isPositiveDefinite 通过 Cholesky 分解判断矩阵是否正定
func isPositiveDefinite(a [][]float64) bool {
	n := len(a)
	l := make([][]float64, n)
	for i := 0; i < n; i++ {
		l[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := 0; j <= i; j++ {
			sum := 0.0
			for k := 0; k < j; k++ {
				sum += l[i][k] * l[j][k]
			}
			if i == j {
				val := a[i][i] - sum
				if val <= 0 {
					return false
				}
				l[i][j] = math.Sqrt(val)
			} else {
				if l[j][j] == 0 {
					return false
				}
				l[i][j] = (a[i][j] - sum) / l[j][j]
			}
		}
	}
	return true
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

	// 闭式解：w = Σ^(-1) * 1 / (1' * Σ^(-1) * 1)
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
		return randomSearch(mu, sigma, c, "minVolatility", numIter)
	}

	weights := make([]float64, n)
	for i := range weights {
		weights[i] = sigmaInvOnes[i] / denom
	}

	// 检查约束
	if satisfiesConstraints(weights, c) {
		return weights
	}

	// 投影梯度法：逐步投影到约束可行域
	// 企业理由：Lipschitz 常数取矩阵最大特征值的倒数，保证收敛
	lipConst := maxEigenvalue(sigma)
	if lipConst <= 0 {
		lipConst = 1.0
	}
	step := 1.0 / lipConst

	// 从闭式解出发，迭代投影
	w := make([]float64, n)
	copy(w, weights)
	for iter := 0; iter < projIterations; iter++ {
		// 梯度：∂(w'Σw)/∂w = 2Σw
		grad := matVecMul(sigma, w)
		for i := range w {
			w[i] -= step * 2 * grad[i]
		}
		w = projectWeights(w, c)
	}

	// 验证结果是否合理
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
	totalSubsets := 1 << n // 2^n
	bestSharpe := math.Inf(-1)
	bestWeights := make([]float64, n)
	for i := range bestWeights {
		bestWeights[i] = 1.0 / float64(n) // 默认等权
	}

	for mask := 1; mask < totalSubsets; mask++ {
		// 提取子集索引
		indices := make([]int, 0, n)
		for i := 0; i < n; i++ {
			if mask&(1<<i) != 0 {
				indices = append(indices, i)
			}
		}
		k := len(indices)

		// 构建子集的 mu 和 sigma
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

		// 切线组合：w ∝ Σ^(-1)(μ - rf*1)
		excess := make([]float64, k)
		for i := range excess {
			excess[i] = subMu[i] - riskFreeRate
		}
		rawW := matVecMul(subSigmaInv, excess)

		// 归一化
		sumRaw := 0.0
		for _, v := range rawW {
			sumRaw += v
		}
		if math.Abs(sumRaw) < 1e-15 {
			continue
		}
		for i := range rawW {
			rawW[i] /= sumRaw
		}

		// 映射回完整权重向量
		fullW := make([]float64, n)
		for i, idx := range indices {
			fullW[idx] = rawW[i]
		}

		// 如果违反约束，裁剪并重新归一化
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
	n := len(mu)
	sigmaInv, err := invertMatrix(sigma)
	if err != nil {
		return randomSearch(mu, sigma, c, "maxSharpe", numIter)
	}

	// 切线组合：w ∝ Σ^(-1)(μ - rf*1)
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
		return randomSearch(mu, sigma, c, "maxSharpe", numIter)
	}
	for i := range rawW {
		rawW[i] /= sumRaw
	}

	if satisfiesConstraints(rawW, c) {
		return rawW
	}

	// 裁剪到约束范围
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
	type idxReturn struct {
		idx    int
		retVal float64
	}
	sorted := make([]idxReturn, n)
	for i, r := range mu {
		sorted[i] = idxReturn{i, r}
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].retVal > sorted[j].retVal
	})

	weights := make([]float64, n)
	remaining := 1.0
	for _, sr := range sorted {
		alloc := math.Min(c.MaxWeight, remaining)
		if alloc < c.MinWeight && remaining > c.MinWeight {
			alloc = c.MinWeight
		}
		if alloc > remaining {
			alloc = remaining
		}
		weights[sr.idx] = alloc
		remaining -= alloc
		if remaining <= 1e-10 {
			break
		}
	}

	// 如果还有剩余，分配给最后一个
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

// ============================================================
// 有效前沿点求解
// ============================================================

// solveFrontierPoint 求解有效前沿上的一个点
//
// 企业理由：Lagrange 系统给出无约束最优，负权重时用线性插值回退，
// 保证前沿曲线连续光滑。
func solveFrontierPoint(mu []float64, sigma [][]float64, targetRet float64, c Constraints) []float64 {
	n := len(mu)
	sigmaInv, err := invertMatrix(sigma)
	if err != nil {
		// 矩阵不可逆，回退到随机搜索
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}

	ones := make([]float64, n)
	for i := range ones {
		ones[i] = 1.0
	}

	// a = 1'Σ^(-1)1, b = 1'Σ^(-1)μ, c = μ'Σ^(-1)μ
	sigmaInvOnes := matVecMul(sigmaInv, ones)
	sigmaInvMu := matVecMul(sigmaInv, mu)

	a := 0.0
	for i := range ones {
		a += ones[i] * sigmaInvOnes[i]
	}
	b := 0.0
	for i := range ones {
		b += ones[i] * sigmaInvMu[i]
	}
	cc := 0.0
	for i := range mu {
		cc += mu[i] * sigmaInvMu[i]
	}

	// Lagrange 系统：[a b; b c] * [λ1; λ2] = [-1; -targetRet]
	det := a*cc - b*b
	if math.Abs(det) < 1e-15 {
		// 奇异，回退
		return randomSearch(mu, sigma, c, "minVolatility", defaultIterations)
	}
	lambda1 := (-cc + b*targetRet) / det
	lambda2 := (b - a*targetRet) / det

	// w = λ1 * Σ^(-1)*1 + λ2 * Σ^(-1)*μ
	weights := make([]float64, n)
	for i := 0; i < n; i++ {
		weights[i] = lambda1*sigmaInvOnes[i] + lambda2*sigmaInvMu[i]
	}

	// 检查是否有负权重
	hasNeg := false
	for _, w := range weights {
		if w < -1e-10 {
			hasNeg = true
			break
		}
	}

	if hasNeg {
		// 线性插值回退：在最小波动率和最大收益组合之间插值
		return linearInterpolationFallback(mu, sigma, targetRet, c)
	}

	// 归一化（确保权重和为1）
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

	// t = (targetRet - retMin) / (retMax - retMin)
	t := (targetRet - retMin) / (retMax - retMin)
	t = math.Max(0, math.Min(1, t))

	n := len(mu)
	weights := make([]float64, n)
	for i := 0; i < n; i++ {
		weights[i] = (1-t)*wMinVol[i] + t*wMaxRet[i]
	}
	return weights
}

// ============================================================
// 随机搜索回退
// ============================================================

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

	rng := rand.New(rand.NewSource(42)) // 固定种子保证可复现

	for iter := 0; iter < numIter; iter++ {
		w := randomWeights(n, c, rng)
		ret, vol, sharpe := portfolioMetrics(w, mu, sigma)

		var score float64
		switch objective {
		case "maxSharpe":
			score = sharpe
		case "minVolatility":
			score = -vol // 负号使最小化变为最大化
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

	// 确保最后一个权重在约束范围内
	if weights[n-1] > c.MaxWeight {
		weights[n-1] = c.MaxWeight
	}
	if weights[n-1] < c.MinWeight && remaining > c.MinWeight {
		weights[n-1] = c.MinWeight
	}

	// 归一化
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

// ============================================================
// 矩阵运算
// ============================================================

// invertMatrix 使用 Gauss-Jordan 消元法求矩阵逆
//
// 企业理由：闭式解需要矩阵求逆。Gauss-Jordan 法实现简单，
// 对 N<=50 的矩阵性能足够（实际投资组合通常 N<20）。
func invertMatrix(a [][]float64) ([][]float64, error) {
	n := len(a)
	if n == 0 {
		return nil, fmt.Errorf("矩阵为空")
	}

	// 构建增广矩阵 [A | I]
	aug := make([][]float64, n)
	for i := 0; i < n; i++ {
		aug[i] = make([]float64, 2*n)
		for j := 0; j < n; j++ {
			aug[i][j] = a[i][j]
		}
		aug[i][n+i] = 1.0
	}

	// 前向消元（部分主元选取）
	for col := 0; col < n; col++ {
		// 找最大主元
		maxRow := col
		maxVal := math.Abs(aug[col][col])
		for row := col + 1; row < n; row++ {
			if math.Abs(aug[row][col]) > maxVal {
				maxVal = math.Abs(aug[row][col])
				maxRow = row
			}
		}
		if maxVal < 1e-15 {
			return nil, fmt.Errorf("矩阵奇异，无法求逆")
		}

		// 交换行
		aug[col], aug[maxRow] = aug[maxRow], aug[col]

		// 归一化主元行
		pivot := aug[col][col]
		for j := 0; j < 2*n; j++ {
			aug[col][j] /= pivot
		}

		// 消去其他行
		for row := 0; row < n; row++ {
			if row == col {
				continue
			}
			factor := aug[row][col]
			for j := 0; j < 2*n; j++ {
				aug[row][j] -= factor * aug[col][j]
			}
		}
	}

	// 提取逆矩阵
	inv := make([][]float64, n)
	for i := 0; i < n; i++ {
		inv[i] = make([]float64, n)
		for j := 0; j < n; j++ {
			inv[i][j] = aug[i][n+j]
		}
	}

	return inv, nil
}

// matVecMul 矩阵乘向量
func matVecMul(mat [][]float64, vec []float64) []float64 {
	n := len(mat)
	result := make([]float64, n)
	for i := 0; i < n; i++ {
		sum := 0.0
		for j := 0; j < len(vec); j++ {
			sum += mat[i][j] * vec[j]
		}
		result[i] = sum
	}
	return result
}

// copyMatrix 深拷贝矩阵
func copyMatrix(a [][]float64) [][]float64 {
	n := len(a)
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, len(a[i]))
		copy(result[i], a[i])
	}
	return result
}

// maxEigenvalue 幂迭代法求矩阵最大特征值
//
// 企业理由：投影梯度法需要 Lipschitz 常数（=最大特征值），
// 幂迭代法对对称正定矩阵收敛快，10-20次迭代即可。
func maxEigenvalue(a [][]float64) float64 {
	n := len(a)
	if n == 0 {
		return 0
	}

	// 初始向量
	v := make([]float64, n)
	for i := range v {
		v[i] = 1.0
	}

	for iter := 0; iter < 100; iter++ {
		w := matVecMul(a, v)
		norm := 0.0
		for _, x := range w {
			norm += x * x
		}
		if norm < 1e-30 {
			return 0
		}
		norm = math.Sqrt(norm)
		for i := range v {
			v[i] = w[i] / norm
		}
	}

	// Rayleigh 商
	w := matVecMul(a, v)
	dot := 0.0
	for i := range v {
		dot += v[i] * w[i]
	}
	return dot
}

// ============================================================
// 辅助函数
// ============================================================

// portfolioMetrics 计算组合的收益、波动率、夏普比
func portfolioMetrics(w, mu []float64, sigma [][]float64) (float64, float64, float64) {
	ret := 0.0
	for i := range mu {
		ret += w[i] * mu[i]
	}

	// w'Σw
	wSigma := matVecMul(sigma, w)
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

// projectWeights 投影权重到约束可行域
//
// 企业理由：投影梯度法需要将权重投影到 [minW, maxW] 且和为1的可行域。
// 交替执行裁剪和归一化直到收敛。
func projectWeights(w []float64, c Constraints) []float64 {
	n := len(w)
	result := make([]float64, n)
	copy(result, w)

	for iter := 0; iter < 100; iter++ {
		// 裁剪到 [minW, maxW]
		for i := range result {
			result[i] = math.Max(c.MinWeight, math.Min(c.MaxWeight, result[i]))
		}
		// 归一化使和为1
		sumW := 0.0
		for _, v := range result {
			sumW += v
		}
		if math.Abs(sumW) < 1e-15 {
			for i := range result {
				result[i] = 1.0 / float64(n)
			}
			return result
		}
		for i := range result {
			result[i] /= sumW
		}
		// 检查是否收敛
		if satisfiesConstraints(result, c) {
			break
		}
	}

	return result
}

// clipWeights 裁剪权重到约束范围并归一化
func clipWeights(w []float64, c Constraints) []float64 {
	n := len(w)
	result := make([]float64, n)
	copy(result, w)

	for i := range result {
		result[i] = math.Max(c.MinWeight, math.Min(c.MaxWeight, result[i]))
	}

	// 归一化
	sumW := 0.0
	for _, v := range result {
		sumW += v
	}
	if sumW > 1e-15 {
		for i := range result {
			result[i] /= sumW
		}
	} else {
		for i := range result {
			result[i] = 1.0 / float64(n)
		}
	}

	return result
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
