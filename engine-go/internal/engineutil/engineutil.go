// Package engineutil 提供回测引擎的共享纯函数工具集（叶子包，不依赖 engine/tactical）。
//
// 企业理由：engine 与 tactical（engine/tactical 子包）历史上各自维护
// shouldRebalance / parseDate / getISOWeek / normalizeWeights 的本地副本，
// 导致行为漂移（例如 tactical 的 quarterly 分桶使用 int(month)/3 错误分桶，
// 与 engine 的 (int(month)-1)/3 不一致）。本包收口为单一权威实现，确保
// 频率触发、阈值触发、偏离带（bands）触发、权重归一化在所有调用方一致。
package engineutil

import (
	"math"
	"time"
)

// RebalanceBands 再平衡偏离带配置，与 packages/shared/types/portfolio.ts 的 RebalanceBands 对齐。
// 支持对称（absoluteBand/relativeBand）与非对称（upperBand/lowerBand）两种触发方式。
type RebalanceBands struct {
	Enabled      bool     `json:"enabled"`
	AbsoluteBand *float64 `json:"absoluteBand,omitempty"`
	RelativeBand *float64 `json:"relativeBand,omitempty"`
	UpperBand    *float64 `json:"upperBand,omitempty"`
	LowerBand    *float64 `json:"lowerBand,omitempty"`
}

// ShouldRebalance 判断当前交易日是否需要再平衡。
//
// frequency 支持: daily, weekly, monthly, quarterly, annual, none, threshold。
// prevDate 为上一交易日（非上次再平衡日），频率触发以"日历自然边界变化"为准。
// threshold 为相对偏离阈值（百分比，>0 生效），holdings 为各资产持仓市值，
// weights 为当前目标权重（含 glidepath 插值），pv 为组合总市值，bands 为偏离带配置。
func ShouldRebalance(
	frequency, prevDate, currDate string,
	threshold float64,
	holdings, weights []float64,
	pv float64,
	bands *RebalanceBands,
) bool {
	parse := func(s string) (time.Time, bool) {
		t, err := time.Parse("2006-01-02", s)
		return t, err == nil
	}

	freqTrigger := false
	switch frequency {
	case "daily":
		freqTrigger = true
	case "none":
		return false
	case "weekly":
		p, okp := parse(prevDate)
		c, okc := parse(currDate)
		if okp && okc {
			_, pw := p.ISOWeek()
			_, cw := c.ISOWeek()
			freqTrigger = cw != pw || c.Year() != p.Year()
		}
	case "monthly":
		p, okp := parse(prevDate)
		c, okc := parse(currDate)
		if okp && okc {
			freqTrigger = c.Month() != p.Month() || c.Year() != p.Year()
		}
	case "quarterly":
		p, okp := parse(prevDate)
		c, okc := parse(currDate)
		if okp && okc {
			pq := (int(p.Month()) - 1) / 3
			cq := (int(c.Month()) - 1) / 3
			freqTrigger = pq != cq || p.Year() != c.Year()
		}
	case "annual":
		p, okp := parse(prevDate)
		c, okc := parse(currDate)
		if okp && okc {
			freqTrigger = p.Year() != c.Year()
		}
	case "threshold":
		if threshold > 0 && pv > 0 {
			for j := range holdings {
				if weights[j] == 0 {
					continue
				}
				actual := holdings[j] / pv
				dev := math.Abs(actual-weights[j]) / math.Abs(weights[j]) * 100
				if dev >= threshold {
					return true
				}
			}
		}
		return false
	default:
		return false
	}

	if freqTrigger {
		return true
	}

	// 频率未触发时，检查偏离带（bands）。
	if bands != nil {
		for i, w := range weights {
			actual := 0.0
			if pv > 0 {
				actual = holdings[i] / pv
			}
			drift := actual - w
			if bands.AbsoluteBand != nil && math.Abs(drift) > *bands.AbsoluteBand/100 {
				return true
			}
			if bands.RelativeBand != nil && w > 0 && math.Abs(drift)/w > *bands.RelativeBand/100 {
				return true
			}
		}
	}

	return false
}

// NormalizeWeights 将权重切片归一化至总和为 1。
// 输入应为非负权重值（调用方负责百分比→小数转换）。总和 <= 0 时退化为等权重，
// 避免对负权和零和输入产生无意义的归一化结果。
func NormalizeWeights(weights []float64) []float64 {
	n := len(weights)
	result := make([]float64, n)
	copy(result, weights)
	sum := 0.0
	for _, v := range result {
		sum += v
	}
	if sum <= 0 {
		for i := range result {
			result[i] = 1.0 / float64(n)
		}
		return result
	}
	for i := range result {
		result[i] /= sum
	}
	return result
}
