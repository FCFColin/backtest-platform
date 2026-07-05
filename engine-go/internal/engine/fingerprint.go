// Package engine provides backtest calculation engine.
package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// ComputeFingerprint 计算回测结果的确定性指纹。
// 只包含关键字段，按规范序列化确保跨平台一致性。
func ComputeFingerprint(result *PortfolioResult) string {
	h := sha256.New()
	encoder := json.NewEncoder(h)
	encoder.SetEscapeHTML(false)

	// 规范序列化关键指标
	summary := map[string]any{
		"final_nav":    result.Statistics.CAGR,
		"total_return": result.Statistics.TotalReturn,
		"sharpe":       result.Statistics.Sharpe,
		"max_drawdown": result.Statistics.MaxDrawdown,
		"sortino":      result.Statistics.Sortino,
		"stdev":        result.Statistics.Stdev,
		"calmar":       result.Statistics.Calmar,
	}
	encoder.Encode(summary)

	// 等间隔采样增长曲线（固定 20 个点，保证指纹长度稳定）
	sampled := sampleEvery(result.GrowthCurve, 20)
	encoder.Encode(map[string]any{"growth_sampled": sampled})

	return hex.EncodeToString(h.Sum(nil))
}

// sampleEvery 从 DataPoint 切片等间隔采样 n 个点。
func sampleEvery(curve []DataPoint, n int) []DataPoint {
	if len(curve) <= n {
		return curve
	}
	result := make([]DataPoint, n)
	step := float64(len(curve)-1) / float64(n-1)
	for i := 0; i < n; i++ {
		idx := int(float64(i) * step)
		if idx >= len(curve) {
			idx = len(curve) - 1
		}
		result[i] = curve[idx]
	}
	return result
}
