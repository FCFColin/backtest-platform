package montecarlo

// Monte Carlo Optimizer 引擎。
// 在蒙特卡洛路径下寻找最优权重。
//
// 算法：贝叶斯优化或遗传算法（gonum 有支持）。
// 输入：资产池 + 目标（最大化中位 CAGR / 最小化 5% 分位回撤）
// 输出：最优权重 + 目标值分布

import (
	"math/rand"
	"sort"
)

// OptimizationGoal 定义优化目标类型
type OptimizationGoal string

const (
	GoalMaxMedianCAGR  OptimizationGoal = "max_median_cagr"
	GoalMinDrawdown5pc  OptimizationGoal = "min_drawdown_5pc"
	GoalMaxSharpe       OptimizationGoal = "max_sharpe"
	GoalMaxSortino      OptimizationGoal = "max_sortino"
)

// OptimizationConfig 优化配置
type OptimizationConfig struct {
	NumAssets      int               // 资产数量
	NumSimulations int               // 每次评估的模拟次数
	NumIterations  int               // 优化迭代次数
	Goal          OptimizationGoal  // 优化目标
	MinWeight     float64            // 每个资产最小权重
	MaxWeight     float64            // 每个资产最大权重
}

// OptimizationResult 优化结果
type OptimizationResult struct {
	OptimalWeights []float64         // 最优权重
	OptimalValue   float64           // 最优目标值
	Distribution   []float64         // 目标值分布（历史迭代）
	Convergence    []float64         // 收敛曲线
}

// OptimizeWeights 通过随机搜索优化权重。
// 这是一个骨架实现，后续可替换为贝叶斯优化或遗传算法。
func OptimizeWeights(
	returns [][]float64, // 每个资产的历史日收益率
	config OptimizationConfig,
) OptimizationResult {
	bestWeights := make([]float64, config.NumAssets)
	bestValue := -1e18

	distribution := make([]float64, 0, config.NumIterations)
	convergence := make([]float64, 0, config.NumIterations)

	for iter := 0; iter < config.NumIterations; iter++ {
		// 生成随机权重（满足约束）
		weights := generateRandomWeights(config.NumAssets, config.MinWeight, config.MaxWeight)

		// 评估权重组合
		value := evaluateWeights(returns, weights, config.NumSimulations, config.Goal)

		distribution = append(distribution, value)

		if value > bestValue {
			bestValue = value
			copy(bestWeights, weights)
		}

		convergence = append(convergence, bestValue)
	}

	return OptimizationResult{
		OptimalWeights: bestWeights,
		OptimalValue:   bestValue,
		Distribution:   distribution,
		Convergence:    convergence,
	}
}

// generateRandomWeights 生成满足约束的随机权重（和为 1）
func generateRandomWeights(n int, minW, maxW float64) []float64 {
	weights := make([]float64, n)
	for i := range weights {
		weights[i] = minW + rand.Float64()*(maxW-minW)
	}
	// 归一化到和为 1
	total := 0.0
	for _, w := range weights {
		total += w
	}
	for i := range weights {
		weights[i] /= total
	}
	return weights
}

// evaluateWeights 评估给定权重组合的目标值
func evaluateWeights(
	returns [][]float64,
	weights []float64,
	numSims int,
	goal OptimizationGoal,
) float64 {
	// 计算加权组合收益率
	n := len(returns)
	if n == 0 {
		return 0
	}
	lenData := len(returns[0])

	// 生成模拟路径并计算目标值
	values := make([]float64, 0, numSims)
	for sim := 0; sim < numSims; sim++ {
		// 随机重采样
		cumReturn := 0.0
		for i := 0; i < 252; i++ { // 1年
			idx := rand.Intn(lenData)
			dailyReturn := 0.0
			for a := 0; a < n; a++ {
				dailyReturn += weights[a] * returns[a][idx]
			}
			cumReturn += dailyReturn
		}
		values = append(values, cumReturn)
	}

	sort.Float64s(values)

	switch goal {
	case GoalMaxMedianCAGR:
		median := values[len(values)/2]
		return median
	case GoalMinDrawdown5pc:
		p5 := values[int(float64(len(values))*0.05)]
		return -p5 // 负号使最小化变为最大化
	default:
		median := values[len(values)/2]
		return median
	}
}
