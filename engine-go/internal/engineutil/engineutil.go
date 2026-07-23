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
	"sort"
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
	// 预先解析一次日期，供所有频率分支复用，避免每个 case 重复 parse。
	prevTime, prevOk := time.Parse("2006-01-02", prevDate)
	currTime, currOk := time.Parse("2006-01-02", currDate)
	datesParsed := prevOk == nil && currOk == nil

	freqTrigger := false
	switch frequency {
	case "daily":
		freqTrigger = true
	case "none":
		return false
	case "weekly":
		if datesParsed {
			_, pw := prevTime.ISOWeek()
			_, cw := currTime.ISOWeek()
			freqTrigger = cw != pw || currTime.Year() != prevTime.Year()
		}
	case "monthly":
		if datesParsed {
			freqTrigger = currTime.Month() != prevTime.Month() || currTime.Year() != prevTime.Year()
		}
	case "quarterly":
		if datesParsed {
			pq := (int(prevTime.Month()) - 1) / 3
			cq := (int(currTime.Month()) - 1) / 3
			freqTrigger = pq != cq || prevTime.Year() != currTime.Year()
		}
	case "annual":
		if datesParsed {
			freqTrigger = prevTime.Year() != currTime.Year()
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

// TradingDaysPerYear 年交易日数，用于年化波动率/收益等指标。
// 采用 untyped float constant，既可参与浮点年化计算，也可在调用方
// 显式转换为整型（如统计窗口换算）。历史各包副本均为 252.0。
const TradingDaysPerYear = 252.0

// RiskFreeRate 默认无风险利率，用于夏普比率等风险调整收益指标。
// 各包历史副本均为 0.02（2%）。
const RiskFreeRate = 0.02

// IterDrawdowns 遍历 values，对每个点跟踪运行峰值（running peak），调用 fn。
//
// 对每个 index i：先更新 peak = max(peak, values[i]) 及 peakIdx，再调用
// fn(i, peakIdx, peak)。调用方在 fn 内自行计算回撤深度 (peak - values[i]) / peak
// 并处理 peak ≤ 0 的边界条件（不同调用方的边界处理不同，故不在此统一）。
//
// 当 len(values) == 0 时直接返回，不调用 fn。
// index 0：peak = values[0], peakIdx = 0。
//
// 企业理由（W3-8）：CalcMaxDrawdown/CalcAvgDrawdown/CalcUlcerIndex/CalcDrawdownCurve
// 共享同一段 peak 跟踪逻辑，抽取后各函数只需关注自身 dd 计算与聚合方式。
func IterDrawdowns(values []float64, fn func(idx, peakIdx int, peak float64)) {
	if len(values) == 0 {
		return
	}
	peak := values[0]
	peakIdx := 0
	for i, v := range values {
		if v > peak {
			peak = v
			peakIdx = i
		}
		fn(i, peakIdx, peak)
	}
}

// AlignDates 返回所有 ticker 都有数据的日期交集（按升序排序）。
// 收口自 pca.alignDates / optimizer.collectAlignedDates / goaloptimizer 内联交集逻辑，
// 消除三处副本的行为漂移风险。若 tickers 为空、首个 ticker 无数据或无交集，返回 nil。
func AlignDates(tickers []string, priceData map[string]map[string]float64) []string {
	dateSets := make([]map[string]bool, len(tickers))
	for i, t := range tickers {
		ds := make(map[string]bool)
		if pd, ok := priceData[t]; ok {
			for d := range pd {
				ds[d] = true
			}
		}
		dateSets[i] = ds
	}
	if len(dateSets) == 0 || len(dateSets[0]) == 0 {
		return nil
	}
	var commonDates []string
	for d := range dateSets[0] {
		all := true
		for i := 1; i < len(dateSets); i++ {
			if !dateSets[i][d] {
				all = false
				break
			}
		}
		if all {
			commonDates = append(commonDates, d)
		}
	}
	sort.Strings(commonDates)
	return commonDates
}

// GetSortedDates 获取所有 ticker 价格数据的交易日期并集（排序去重）。
func GetSortedDates(priceData map[string]map[string]float64, tickers []string) []string {
	dateSet := make(map[string]struct{})
	for _, ticker := range tickers {
		if td, ok := priceData[ticker]; ok {
			for date := range td {
				dateSet[date] = struct{}{}
			}
		}
	}
	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	return dates
}

// FilterDates 过滤日期范围（空字符串视为不限制）。
func FilterDates(dates []string, startDate, endDate string) []string {
	if startDate == "" && endDate == "" {
		return dates
	}
	result := make([]string, 0, len(dates))
	for _, d := range dates {
		if startDate != "" && d < startDate {
			continue
		}
		if endDate != "" && d > endDate {
			continue
		}
		result = append(result, d)
	}
	return result
}
