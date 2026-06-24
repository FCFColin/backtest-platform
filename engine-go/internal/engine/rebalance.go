package engine

import (
	"time"
)

// 企业理由：再平衡是投资组合管理的核心操作。不同频率和阈值的再平衡策略
// 直接影响组合的收益和风险特征。将再平衡逻辑独立出来便于单元测试和复用。

// shouldRebalance 判断当前日期是否需要再平衡
//
// frequency 支持: daily, weekly, monthly, quarterly, annual, none, threshold
// lastRebalance 上次再平衡日期
// thresholdDrift 当前权重与目标权重的最大偏差（仅 threshold 模式使用）
func shouldRebalance(frequency string, currentDate, lastRebalance time.Time, thresholdDrift float64) bool {
	switch frequency {
	case "none":
		return false
	case "daily":
		return true
	case "weekly":
		// 企业理由：按周再平衡——每周一执行，与日历周对齐
		return currentDate.Weekday() == time.Monday
	case "monthly":
		// 企业理由：按月再平衡——每月首个交易日执行
		// 简化实现：日期在1-3日之间且月份与上次不同
		return currentDate.Day() <= 3 && currentDate.Month() != lastRebalance.Month()
	case "quarterly":
		// 企业理由：按季再平衡——每季度首月执行
		month := int(currentDate.Month())
		isQuarterStart := month == 1 || month == 4 || month == 7 || month == 10
		return isQuarterStart && currentDate.Day() <= 3 && (currentDate.Month() != lastRebalance.Month() || currentDate.Year() != lastRebalance.Year())
	case "annual":
		// 企业理由：按年再平衡——每年1月执行
		return currentDate.Month() == time.January && currentDate.Day() <= 3 && currentDate.Year() != lastRebalance.Year()
	case "threshold":
		// 企业理由：阈值再平衡——当权重偏差超过阈值时触发
		// 这是最灵活的策略，避免不必要的交易成本
		return thresholdDrift > 0
	default:
		return false
	}
}

// maxWeightDrift 计算当前权重与目标权重的最大偏差
//
// 企业理由：阈值再平衡需要量化权重偏离程度，取各资产偏差的最大值
// 作为触发条件，确保组合不会过度偏离目标配置。
func maxWeightDrift(currentWeights, targetWeights map[string]float64) float64 {
	maxDrift := 0.0
	for ticker, target := range targetWeights {
		current := currentWeights[ticker]
		drift := abs64(current - target)
		if drift > maxDrift {
			maxDrift = drift
		}
	}
	return maxDrift
}

// computeCurrentWeights 根据当前价格和持有份额计算各资产当前权重
func computeCurrentWeights(shares map[string]float64, prices map[string]float64) map[string]float64 {
	total := 0.0
	values := make(map[string]float64, len(shares))
	for ticker, s := range shares {
		price := prices[ticker]
		val := s * price
		values[ticker] = val
		total += val
	}
	weights := make(map[string]float64, len(shares))
	if total == 0 {
		return weights
	}
	for ticker, val := range values {
		weights[ticker] = val / total
	}
	return weights
}

// rebalance 执行再平衡，调整份额使权重回到目标
//
// 企业理由：再平衡通过卖出超配资产、买入低配资产实现。
// 假设无交易成本（drag 已在增长曲线迭代中单独处理），
// 直接按目标权重重新分配组合价值。
func rebalance(state *dailyState, prices map[string]float64) {
	totalValue := 0.0
	for ticker, s := range state.shares {
		totalValue += s * prices[ticker]
	}
	if totalValue <= 0 {
		return
	}
	// 按目标权重重新计算份额
	for ticker, w := range state.weights {
		price := prices[ticker]
		if price > 0 {
			state.shares[ticker] = (totalValue * w) / price
		}
	}
}

func abs64(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
