package analysis

import (
	"context"
	"math"
	"testing"
)

// makePriceData 构造单 ticker 的价格数据用于测试。
func makePriceData(ticker string, dates []string, prices []float64) map[string]map[string]float64 {
	pd := map[string]map[string]float64{ticker: {}}
	for i, d := range dates {
		pd[ticker][d] = prices[i]
	}
	return pd
}

func TestRunAnalysisEmptyTickers(t *testing.T) {
	req := AnalysisRequest{
		Tickers:   []string{},
		PriceData: map[string]map[string]float64{},
		Params:    AnalysisParams{StartingValue: 10000},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Assets) != 0 {
		t.Errorf("expected 0 assets, got %d", len(result.Assets))
	}
}

func TestRunAnalysisSingleTickerGrowthCurve(t *testing.T) {
	dates := []string{"2024-01-02", "2024-01-03", "2024-01-04"}
	prices := []float64{100, 110, 120}
	req := AnalysisRequest{
		Tickers:   []string{"SPY"},
		PriceData: makePriceData("SPY", dates, prices),
		Params: AnalysisParams{
			StartingValue:       10000,
			RollingWindowMonths: 12,
		},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Assets) != 1 {
		t.Fatalf("expected 1 asset, got %d", len(result.Assets))
	}
	asset := result.Assets[0]
	if asset.Ticker != "SPY" {
		t.Errorf("expected ticker SPY, got %s", asset.Ticker)
	}
	// 净值曲线：100/100*10000=10000, 110/100*10000=11000, 120/100*10000=12000
	if len(asset.GrowthCurve) != 3 {
		t.Fatalf("expected 3 growth points, got %d", len(asset.GrowthCurve))
	}
	expected := []float64{10000, 11000, 12000}
	for i, gp := range asset.GrowthCurve {
		if math.Abs(gp.Value-expected[i]) > 0.01 {
			t.Errorf("growth[%d] = %v, want %v", i, gp.Value, expected[i])
		}
	}
}

func TestRunAnalysisDefaultStartingValue(t *testing.T) {
	dates := []string{"2024-01-02", "2024-01-03"}
	prices := []float64{50, 100}
	req := AnalysisRequest{
		Tickers:   []string{"X"},
		PriceData: makePriceData("X", dates, prices),
		Params:    AnalysisParams{StartingValue: 0},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// StartingValue=0 应使用默认值 10000
	if result.Assets[0].GrowthCurve[0].Value != 10000 {
		t.Errorf("expected default starting value 10000, got %v", result.Assets[0].GrowthCurve[0].Value)
	}
}

func TestRunAnalysisInsufficientData(t *testing.T) {
	dates := []string{"2024-01-02"}
	prices := []float64{100}
	req := AnalysisRequest{
		Tickers:   []string{"LONE"},
		PriceData: makePriceData("LONE", dates, prices),
		Params:    AnalysisParams{StartingValue: 10000},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 仅 1 个数据点 (< 2)，应返回空统计
	if len(result.Assets) != 1 {
		t.Fatalf("expected 1 asset, got %d", len(result.Assets))
	}
	if result.Assets[0].Statistics.CAGR != 0 {
		t.Errorf("expected zero CAGR for insufficient data, got %v", result.Assets[0].Statistics.CAGR)
	}
}

func TestRunAnalysisContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	dates := []string{"2024-01-02", "2024-01-03"}
	prices := []float64{100, 110}
	req := AnalysisRequest{
		Tickers:   []string{"CTX"},
		PriceData: makePriceData("CTX", dates, prices),
		Params:    AnalysisParams{StartingValue: 10000},
	}
	_, err := RunAnalysis(ctx, req)
	if err == nil {
		t.Error("expected context cancellation error, got nil")
	}
}

func TestRunAnalysisCorrelationMatrix(t *testing.T) {
	req := AnalysisRequest{
		Tickers: []string{"A", "B"},
		PriceData: map[string]map[string]float64{
			"A": {"2024-01-02": 100, "2024-01-03": 110, "2024-01-04": 120, "2024-01-05": 130},
			"B": {"2024-01-02": 200, "2024-01-03": 210, "2024-01-04": 220, "2024-01-05": 230},
		},
		Params: AnalysisParams{StartingValue: 10000},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 对角线应为 1
	if math.Abs(result.Correlations[0][0]-1.0) > 1e-10 {
		t.Errorf("correlation[0][0] = %v, want 1.0", result.Correlations[0][0])
	}
	if math.Abs(result.Correlations[1][1]-1.0) > 1e-10 {
		t.Errorf("correlation[1][1] = %v, want 1.0", result.Correlations[1][1])
	}
	// 对称矩阵
	if math.Abs(result.Correlations[0][1]-result.Correlations[1][0]) > 1e-10 {
		t.Errorf("correlation matrix not symmetric: [0][1]=%v [1][0]=%v",
			result.Correlations[0][1], result.Correlations[1][0])
	}
}

func TestRunAnalysisTotalReturn(t *testing.T) {
	dates := []string{"2024-01-02", "2024-01-03", "2024-01-04"}
	prices := []float64{100, 120, 150}
	req := AnalysisRequest{
		Tickers:   []string{"TR"},
		PriceData: makePriceData("TR", dates, prices),
		Params:    AnalysisParams{StartingValue: 10000},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	stats := result.Assets[0].Statistics
	expectedTotalReturn := (150.0 - 100.0) / 100.0
	if math.Abs(stats.TotalReturn-expectedTotalReturn) > 1e-6 {
		t.Errorf("TotalReturn = %v, want %v", stats.TotalReturn, expectedTotalReturn)
	}
}

func TestRunAnalysisBetaAlphaZeroWithoutBenchmark(t *testing.T) {
	dates := []string{"2024-01-02", "2024-01-03", "2024-01-04"}
	prices := []float64{100, 110, 120}
	req := AnalysisRequest{
		Tickers:   []string{"NOBENCH"},
		PriceData: makePriceData("NOBENCH", dates, prices),
		Params:    AnalysisParams{StartingValue: 10000},
	}
	result, err := RunAnalysis(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	stats := result.Assets[0].Statistics
	if stats.Beta != 0 {
		t.Errorf("Beta = %v, want 0 (no benchmark)", stats.Beta)
	}
	if stats.Alpha != 0 {
		t.Errorf("Alpha = %v, want 0 (no benchmark)", stats.Alpha)
	}
}
