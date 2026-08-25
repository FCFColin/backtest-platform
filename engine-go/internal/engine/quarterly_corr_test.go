package engine

import (
	"testing"
	"time"
)

func TestComputeQuarterlyCorrelationMatrices(t *testing.T) {
	// 两资产、两个季度：Q1 同向（相关≈1），Q2 反向（相关≈-1）
	dates := make([]time.Time, 0, 14)
	var aRet, bRet []float64
	for q := 0; q < 2; q++ {
		signA := 1 - 2*q // Q1 a 与 b 同向→+1；Q2 反向→−1
		for d := 1; d <= 7; d++ {
			dates = append(dates, time.Date(2024, time.Month(q*3+1), d, 0, 0, 0, 0, time.UTC))
			aRet = append(aRet, float64(signA)*(0.005+0.001*float64(d)))
			bRet = append(bRet, 0.01+0.002*float64(d))
		}
	}
	out := ComputeQuarterlyCorrelationMatrices([]string{"AAA", "BBB"}, [][]float64{aRet, bRet}, dates)
	if len(out) != 2 {
		t.Fatalf("季度数 = %d, want 2", len(out))
	}
	if out[0].Quarter != "2024Q1" || out[1].Quarter != "2024Q2" {
		t.Errorf("季度键 = %s/%s", out[0].Quarter, out[1].Quarter)
	}
	if len(out[0].Matrix) != 2 || out[0].Matrix[0][0] != 1 {
		t.Fatalf("矩阵形状/对角异常: %+v", out[0].Matrix)
	}
	if out[0].Matrix[0][1] < 0.99 {
		t.Errorf("Q1 同向相关应≈1: %v", out[0].Matrix[0][1])
	}
	if out[1].Matrix[0][1] > -0.99 {
		t.Errorf("Q2 反向相关应≈-1: %v", out[1].Matrix[0][1])
	}
}

func dailyReturnsOf(levels []float64) []float64 {
	rets := make([]float64, len(levels)-1)
	for i := 1; i < len(levels); i++ {
		rets[i-1] = (levels[i] - levels[i-1]) / levels[i-1]
	}
	return rets
}
