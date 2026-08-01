package engine

import (
	"context"
	"engine-go/internal/enginetest"
	"engine-go/internal/engineutil"
	"testing"
	"time"
)

func TestRunBacktest(t *testing.T) {
	t.Run("基本回测应成功", func(t *testing.T) {
		priceData := enginetest.ThreeTickerData(time.Date(2023, 1, 3, 0, 0, 0, 0, time.UTC), 100, 0.0003)
		req := BacktestRequest{
			Portfolios: []PortfolioInput{{Name: "60/40",
				Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
				RebalanceFrequency: "monthly", TotalReturn: true,
			},
			},
			PriceData:     priceData,
			CPIData:       map[string]float64{},
			ExchangeRates: map[string]float64{},
			Params:        BacktestParams{StartDate: "2023-01-03", EndDate: "2023-05-01", StartingValue: 10000, AdjustForInflation: false, RollingWindowMonths: 12, BenchmarkTicker: "VTI"},
		}
		result, err := RunBacktest(context.Background(), req)
		if err != nil {
			t.Fatalf("RunBacktest 返回错误: %v", err)
		}
		if len(result.Portfolios) != 1 {
			t.Errorf("期望 1 个组合结果，实际 %d", len(result.Portfolios))
		}
		if len(result.Portfolios[0].GrowthCurve) == 0 {
			t.Error("增长曲线不应为空")
		}
	})
	t.Run("日期范围无数据应报错", func(t *testing.T) {
		_, err := RunBacktest(context.Background(), BacktestRequest{
			Portfolios: []PortfolioInput{{Name: "test", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}}},
			PriceData:  enginetest.ThreeTickerData(time.Date(2023, 1, 3, 0, 0, 0, 0, time.UTC), 100, 0.0003),
			Params:     BacktestParams{StartDate: "2099-01-01", EndDate: "2099-12-31"},
		})
		if err == nil {
			t.Fatal("无数据日期范围应返回错误")
		}
	})
}
func TestParseTradingDates(t *testing.T) {
	t.Run("正常数据应返回排序日期", func(t *testing.T) {
		priceData := PriceDataMap{"VTI": {"2023-01-03": 100, "2023-01-04": 101, "2023-01-05": 102}}
		dates, err := engineutil.ParseTradingDates(priceData)
		if err != nil {
			t.Fatalf("parseTradingDates 返回错误: %v", err)
		}
		if len(dates) != 3 {
			t.Errorf("期望 3 个日期，实际 %d", len(dates))
		}
	})
	t.Run("空数据应返回空日期", func(t *testing.T) {
		dates, err := engineutil.ParseTradingDates(PriceDataMap{})
		if err != nil {
			t.Fatalf("空数据不应返回错误: %v", err)
		}
		if len(dates) != 0 {
			t.Errorf("期望 0 个日期，实际 %d", len(dates))
		}
	})
}
func TestFilterByDateRange(t *testing.T) {
	priceData := PriceDataMap{"VTI": {"2023-01-03": 100, "2023-01-04": 101, "2023-01-05": 102, "2023-01-06": 103}}
	dates, _ := engineutil.ParseTradingDates(priceData)
	t.Run("范围内过滤", func(t *testing.T) {
		filtered := engineutil.FilterByDateRange(dates, "2023-01-04", "2023-01-05")
		if len(filtered) != 2 {
			t.Errorf("期望 2 个日期，实际 %d", len(filtered))
		}
	})
	t.Run("空范围应返回空", func(t *testing.T) {
		filtered := engineutil.FilterByDateRange(dates, "2099-01-01", "2099-12-31")
		if len(filtered) != 0 {
			t.Errorf("期望 0 个日期，实际 %d", len(filtered))
		}
	})
}
func newBenchBacktestRequest() BacktestRequest {
	return BacktestRequest{
		Portfolios: []PortfolioInput{{Name: "60/40",
			Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
			RebalanceFrequency: "monthly", Drag: 0, TotalReturn: true,
		},
		},
		PriceData:     enginetest.ThreeTickerData(time.Date(2014, 1, 2, 0, 0, 0, 0, time.UTC), 2520, 0.0003),
		CPIData:       map[string]float64{},
		ExchangeRates: map[string]float64{},
		Params:        BacktestParams{StartDate: "2014-01-02", EndDate: "2023-12-29", StartingValue: 10000, AdjustForInflation: false, RollingWindowMonths: 12, BenchmarkTicker: "VTI"},
	}
}
func BenchmarkRunBacktest(b *testing.B) {
	req := newBenchBacktestRequest()
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := RunBacktest(context.Background(), req)
		if err != nil {
			b.Fatalf("RunBacktest failed: %v", err)
		}
	}
}
func BenchmarkComputeGrowthCurve(b *testing.B) {
	req := newBenchBacktestRequest()
	tradingDates, _ := engineutil.ParseTradingDates(req.PriceData)
	tradingDates = engineutil.FilterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _, err := computeGrowthCurve(
			req.Portfolios[0],
			req.PriceData,
			req.CPIData,
			req.ExchangeRates,
			tradingDates,
			req.Params,
		)
		if err != nil {
			b.Fatalf("computeGrowthCurve failed: %v", err)
		}
	}
}
func BenchmarkComputeStatistics(b *testing.B) {
	req := newBenchBacktestRequest()
	result, _ := RunBacktest(context.Background(), req)
	curve := result.Portfolios[0].GrowthCurve
	episodes := detectDrawdownEpisodes(curve)
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		computeStatistics(curve, episodes, nil)
	}
}
func TestComputeFingerprint_Deterministic(t *testing.T) {
	r1 := &PortfolioResult{
		Name:        "test",
		GrowthCurve: []DataPoint{{Date: "2020-01-01", Value: 10000}, {Date: "2020-01-02", Value: 10100}, {Date: "2020-01-03", Value: 10050}},
		Statistics:  Statistics{CAGR: 0.05, TotalReturn: 0.10, Sharpe: 0.8, MaxDrawdown: -0.15, Sortino: 1.2, Stdev: 0.12, Calmar: 0.33},
	}
	fp1, err := ComputeFingerprint(r1)
	if err != nil {
		t.Fatalf("ComputeFingerprint failed: %v", err)
	}
	if fp1 == "" {
		t.Fatal("fingerprint should not be empty")
	}
	fp2, err := ComputeFingerprint(r1)
	if err != nil {
		t.Fatalf("ComputeFingerprint failed: %v", err)
	}
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
