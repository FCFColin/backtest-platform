package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func ComputeFingerprint(result *PortfolioResult) (string, error) {
	h := sha256.New()
	encoder := json.NewEncoder(h)
	encoder.SetEscapeHTML(false)
	summary := map[string]any{"final_nav": result.Statistics.CAGR, "total_return": result.Statistics.TotalReturn, "sharpe": result.Statistics.Sharpe, "max_drawdown": result.Statistics.MaxDrawdown, "sortino": result.Statistics.Sortino, "stdev": result.Statistics.Stdev, "calmar": result.Statistics.Calmar}
	if err := encoder.Encode(summary); err != nil {
		return "", err
	}
	if err := encoder.Encode(map[string]any{"growth_sampled": sampleEvery(result.GrowthCurve, 20)}); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
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
