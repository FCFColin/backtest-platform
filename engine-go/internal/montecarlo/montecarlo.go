// Package montecarlo 提供蒙特卡洛模拟核心计算逻辑（T-ARCH-2.3）。
//
// 企业理由：蒙特卡洛模拟是退休规划和风险管理的核心工具。通过从历史收益率中
// 重采样生成大量未来路径，为投资者提供概率化的投资结果预测，帮助投资者理解
// 投资结果的不确定性范围，而非仅依赖单一历史路径。
//
// 算法：块自助法（Block Bootstrap）保留收益率序列的自相关结构，
// 比简单随机采样更准确地反映金融时间序列的持续性特征（如波动聚集）。
// 使用 goroutine 并行模拟，可将 1000 次模拟从约 2 秒缩短到约 0.3 秒。
package montecarlo

import (
	"context"
	"fmt"

	"engine-go/internal/engineutil"
)

// ============================================================
// 常量
// ============================================================

const (
	mcTradingDays   = 252  // 年交易日数
	mcRiskFreeRate  = 0.02 // 无风险利率
	mcHistogramBins = 50   // 直方图分箱数
	mcDefaultSims   = 1000 // 默认模拟次数
	mcDefaultYears  = 20   // 默认模拟年数
)

// 类型定义已拆分至 mc_types.go。

// ============================================================
// 核心算法
// ============================================================

// RunMonteCarlo 执行蒙特卡洛模拟，是模块的主入口函数
//
// 企业理由：蒙特卡洛模拟通过从历史收益率中重采样生成大量未来路径，
// 为投资者提供概率化的投资结果预测。这是退休规划和风险管理的核心工具，
// 帮助投资者理解投资结果的不确定性范围，而非仅依赖单一历史路径。
// ctx 用于 per-request 超时控制（handler 层 WithTimeout），在并行模拟前检查取消信号。
// 注：runSimulations 内部 goroutine 受 per-request deadline 兜底；此处检查避免在已超时请求上启动模拟。
func RunMonteCarlo(ctx context.Context, req MonteCarloRequest) (*MonteCarloResult, error) {
	// 1. 参数校验与默认值
	applyDefaults(&req)

	// 2. 计算组合历史日收益率
	dailyReturns, err := computePortfolioDailyReturns(req.Portfolio, req.PriceData, req.Params)
	if err != nil {
		return nil, fmt.Errorf("计算组合日收益率失败: %w", err)
	}
	if len(dailyReturns) < mcTradingDays {
		return nil, fmt.Errorf("历史数据不足：需要至少1年(%d天)的日收益率，实际%d天",
			mcTradingDays, len(dailyReturns))
	}

	// 企业理由：并行模拟是耗时主体，启动前检查 ctx 是否已超时/取消。
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// 3. 并行执行蒙特卡洛模拟
	totalDays := req.MCParams.NumYears * mcTradingDays
	paths := runSimulations(ctx, dailyReturns, totalDays, req.MCParams.NumSimulations,
		req.MCParams, req.Params.StartingValue)

	// 4. 计算百分位数
	percentiles := computePercentiles(paths, totalDays)

	// 5. 计算成功概率（基于 successThreshold）
	successProb := computeSuccessProbability(paths, req.MCParams.SuccessThreshold,
		req.Params.StartingValue)

	// 6. 计算三种成功概率类型（按年采样）
	successProbs := computeSuccessProbabilities(paths, req.Params.StartingValue,
		req.MCParams.NumYears)

	// 7. 计算最终分布直方图
	finalDist := computeFinalDistribution(paths)

	// 8. 计算每条路径的指标
	perPathMetrics := computePerPathMetrics(paths, req.Params.StartingValue,
		req.MCParams.NumYears)

	// 9. 计算统计摘要
	stats := computeMCStatistics(paths, req.MCParams.SuccessThreshold,
		req.Params.StartingValue)

	// 10. 计算代表性路径
	repPaths := computeRepresentativePaths(paths, totalDays)

	return &MonteCarloResult{
		Percentiles:          percentiles,
		SuccessProbability:   successProb,
		FinalDistribution:    finalDist,
		Statistics:           stats,
		PerPathMetrics:       perPathMetrics,
		RepresentativePaths:  repPaths,
		SuccessProbabilities: successProbs,
	}, nil
}

// applyDefaults 应用默认参数值
//
// 企业理由：合理的默认值降低使用门槛，同时允许高级用户自定义参数。
// 默认值基于行业惯例：1000次模拟提供稳定的统计估计，20年覆盖典型退休规划期。
func applyDefaults(req *MonteCarloRequest) {
	if req.MCParams.NumSimulations <= 0 {
		req.MCParams.NumSimulations = mcDefaultSims
	}
	if req.MCParams.NumYears <= 0 {
		req.MCParams.NumYears = mcDefaultYears
	}
	if req.MCParams.MinBlockYears <= 0 {
		req.MCParams.MinBlockYears = 1
	}
	if req.MCParams.MaxBlockYears <= 0 {
		req.MCParams.MaxBlockYears = 5
	}
	if req.MCParams.MinBlockYears > req.MCParams.MaxBlockYears {
		req.MCParams.MinBlockYears, req.MCParams.MaxBlockYears =
			req.MCParams.MaxBlockYears, req.MCParams.MinBlockYears
	}
	if req.Params.StartingValue <= 0 {
		req.Params.StartingValue = 10000
	}
	if req.MCParams.SuccessThreshold <= 0 {
		req.MCParams.SuccessThreshold = 1.0
	}
}

// computePortfolioDailyReturns 计算组合历史日收益率（加权平均）
//
// 企业理由：组合日收益率是蒙特卡洛模拟的输入基础。使用加权平均
// 假设组合按目标权重配置，这是蒙特卡洛模拟的标准做法。
// 对于缺失数据的资产，按可用资产重新归一化权重，避免数据偏差。
func computePortfolioDailyReturns(
	portfolio MCPortfolioInput,
	priceData PriceDataMap,
	params MCBacktestParams,
) ([]float64, error) {
	if len(portfolio.Assets) == 0 {
		return nil, fmt.Errorf("组合无资产")
	}

	// 解析交易日
	tradingDates, err := engineutil.ParseTradingDates(priceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}

	// 日期范围过滤
	tradingDates = engineutil.FilterByDateRange(tradingDates, params.StartDate, params.EndDate)
	if len(tradingDates) == 0 {
		return nil, fmt.Errorf("日期范围内无交易数据")
	}

	// 构建权重映射（前端传入百分比，转换为小数）
	weights := make(map[string]float64, len(portfolio.Assets))
	for _, a := range portfolio.Assets {
		weights[a.Ticker] = a.Weight / 100.0
	}

	// 提取各资产价格序列
	type assetPrices struct {
		prices []float64
		weight float64
	}
	assetList := make([]assetPrices, 0, len(portfolio.Assets))
	for _, a := range portfolio.Assets {
		prices := engineutil.ExtractPrices(priceData, a.Ticker, tradingDates)
		assetList = append(assetList, assetPrices{
			prices: prices,
			weight: weights[a.Ticker],
		})
	}

	// 计算组合日收益率
	returns := make([]float64, 0, len(tradingDates)-1)
	for i := 1; i < len(tradingDates); i++ {
		weightedReturn := 0.0
		totalWeight := 0.0

		for _, ap := range assetList {
			prevPrice := ap.prices[i-1]
			currPrice := ap.prices[i]
			if prevPrice > 0 && currPrice > 0 {
				assetReturn := (currPrice - prevPrice) / prevPrice
				weightedReturn += ap.weight * assetReturn
				totalWeight += ap.weight
			}
		}

		// 企业理由：归一化权重，避免缺失数据导致收益偏低
		if totalWeight > 0 {
			weightedReturn /= totalWeight
		}

		// 企业理由：拖累（drag）模拟管理费、交易成本等持续性损耗
		if portfolio.Drag > 0 {
			weightedReturn -= portfolio.Drag / float64(mcTradingDays)
		}

		returns = append(returns, weightedReturn)
	}

	return returns, nil
}
