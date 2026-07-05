package engine

import (
	"testing"
)

func TestComputeFingerprint_Deterministic(t *testing.T) {
	r1 := &PortfolioResult{
		Name: "test",
		GrowthCurve: []DataPoint{
			{Date: "2020-01-01", Value: 10000},
			{Date: "2020-01-02", Value: 10100},
			{Date: "2020-01-03", Value: 10050},
		},
		Statistics: Statistics{
			CAGR: 0.05,
			TotalReturn: 0.10,
			Sharpe: 0.8,
			MaxDrawdown: -0.15,
			Sortino: 1.2,
			Stdev: 0.12,
			Calmar: 0.33,
		},
	}

	// 第一次计算
	fp1 := ComputeFingerprint(r1)
	if fp1 == "" {
		t.Fatal("fingerprint should not be empty")
	}

	// 第二次计算应相同
	fp2 := ComputeFingerprint(r1)
	if fp1 != fp2 {
		t.Fatalf("fingerprint not deterministic: %s vs %s", fp1, fp2)
	}
}

func TestSampleEvenly(t *testing.T) {
	curve := []DataPoint{
		{Date: "2020-01-01", Value: 10000},
		{Date: "2020-01-02", Value: 10100},
		{Date: "2020-01-03", Value: 10050},
		{Date: "2020-01-04", Value: 10200},
		{Date: "2020-01-05", Value: 10150},
	}

	sampled := sampleEvery(curve, 3)
	if len(sampled) != 3 {
		t.Fatalf("expected 3 sampled points, got %d", len(sampled))
	}
	if sampled[0].Date != "2020-01-01" {
		t.Fatalf("first sampled point should be first date")
	}
	if sampled[len(sampled)-1].Date != "2020-01-05" {
		t.Fatalf("last sampled point should be last date")
	}
}
