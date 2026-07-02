package engine

import (
	"math"
	"time"
)

// 企业理由：再平衡是投资组合管理的核心操作。不同频率和阈值的再平衡策略
// 直接影响组合的收益和风险特征。将再平衡逻辑独立出来便于单元测试和复用。
//
// ADR-008：本判定逻辑与 Rust 引擎 should_rebalance 完全对齐，确保 Go 主引擎
// 与 Rust 回退引擎在频率触发、阈值触发与偏离带（bands）触发上计算结果一致。

// shouldRebalance 判断当前交易日是否需要再平衡。
//
// frequency 支持: daily, weekly, monthly, quarterly, annual, none, threshold。
// prevDate 为上一交易日（非上次再平衡日），与 Rust 引擎一致：频率触发以"日历自然边界变化"为准。
// threshold 为相对偏离阈值（百分比，>0 生效），holdings 为各资产持仓市值，
// weights 为当前目标权重（含 glidepath 插值），pv 为组合总市值，bands 为偏离带配置。
func shouldRebalance(
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
			if bands.Absolute != nil && math.Abs(drift) > *bands.Absolute/100 {
				return true
			}
			if bands.Relative != nil && w > 0 && math.Abs(drift)/w > *bands.Relative/100 {
				return true
			}
		}
	}

	return false
}
