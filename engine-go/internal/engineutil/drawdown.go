// Package engineutil 提供引擎内部共享的纯函数。
// 此文件包含回撤计算相关的共享迭代器。
package engineutil

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
