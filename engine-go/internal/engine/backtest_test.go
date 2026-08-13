package engine

import (
	"context"
	"engine-go/internal/enginetest"
	"engine-go/internal/engineutil"
	"math"
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
func TestComputeBenchmarkGrowth(t *testing.T) {
	t.Run("基准缺口日应沿用最近价而非归零", func(t *testing.T) {
		priceData := PriceDataMap{
			"VTI": {"2023-01-03": 100, "2023-01-04": 101, "2023-01-05": 102, "2023-01-06": 103, "2023-01-09": 104},
			"SPY": {"2023-01-03": 400, "2023-01-04": 402, "2023-01-06": 405, "2023-01-09": 408},
		}
		dates, err := engineutil.ParseTradingDates(priceData)
		if err != nil {
			t.Fatalf("ParseTradingDates 返回错误: %v", err)
		}
		curve := computeBenchmarkGrowth("SPY", priceData, dates, BacktestParams{StartingValue: 10000})
		if len(curve) != 5 {
			t.Fatalf("基准曲线应对齐全部交易日，实际 %d 点", len(curve))
		}
		for _, dp := range curve {
			if dp.Value <= 0 {
				t.Errorf("缺口日不应归零：%s=%v", dp.Date, dp.Value)
			}
		}
		if curve[2].Date != "2023-01-05" || math.Abs(curve[2].Value-10000*402.0/400.0) > 1e-6 {
			t.Errorf("2023-01-05 缺口应沿用 2023-01-04 的 402，实际 %v", curve[2])
		}
	})
	t.Run("基准无任何价格应返回 nil", func(t *testing.T) {
		priceData := PriceDataMap{"VTI": {"2023-01-03": 100, "2023-01-04": 101}}
		dates, err := engineutil.ParseTradingDates(priceData)
		if err != nil {
			t.Fatalf("ParseTradingDates 返回错误: %v", err)
		}
		if curve := computeBenchmarkGrowth("SPY", priceData, dates, BacktestParams{}); curve != nil {
			t.Fatalf("无价格基准应返回 nil，实际 %v", curve)
		}
	})
}
func TestComputeStatisticsBenchmarkLeadingGap(t *testing.T) {
	curve := []DataPoint{{Date: "2024-01-02", Value: 10000}, {Date: "2024-01-03", Value: 10000}, {Date: "2024-01-04", Value: 10000}, {Date: "2024-01-05", Value: 10000}}
	bench := []DataPoint{{Date: "2024-01-02", Value: 0}, {Date: "2024-01-03", Value: 100}, {Date: "2024-01-04", Value: 110}, {Date: "2024-01-05", Value: 121}}
	stats := computeStatistics(curve, nil, bench, nil)
	if stats.ActiveReturn > -1000 {
		t.Errorf("前置缺口时 benchmarkCagr 不应静默为 0：ActiveReturn = %v（应远小于 0）", stats.ActiveReturn)
	}
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
		_, _, _, err := computeGrowthCurve(
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
		computeStatistics(curve, episodes, nil, nil)
	}
}
func TestMWRRCashflowSchedule(t *testing.T) {
	dates := enginetest.Dates("2023-01-02", 30)
	prices := make(map[string]float64, len(dates))
	for _, d := range dates {
		prices[d] = 100
	}
	priceData := PriceDataMap{"VTI": prices}
	tradingDates := make([]time.Time, len(dates))
	for i, d := range dates {
		tradingDates[i], _ = time.Parse("2006-01-02", d)
	}
	pf := PortfolioInput{Name: "t", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}}
	params := BacktestParams{
		StartingValue:    1000,
		OneTimeCashflows: []OneTimeCashflow{{Date: dates[5], Amount: 500, Type: "deposit"}},
		CashflowLegs:     []CashflowLeg{{Amount: 100, Frequency: "monthly", Type: "deposit"}},
	}
	_, _, cfs, err := computeGrowthCurve(pf, priceData, nil, nil, tradingDates, params)
	if err != nil {
		t.Fatalf("computeGrowthCurve 返回错误: %v", err)
	}
	want := []Cashflow{
		{Value: -1000, Time: 0},
		{Value: -500, Time: 5.0 / tradingDaysPerYear},
		{Value: -100, Time: 21.0 / tradingDaysPerYear},
	}
	if len(cfs) != len(want) {
		t.Fatalf("现金流数量 = %d，期望 %d", len(cfs), len(want))
	}
	for i := range cfs {
		assertFloatApprox(t, cfs[i].Value, want[i].Value, "cashflow value")
		assertFloatApprox(t, cfs[i].Time, want[i].Time, "cashflow time")
	}
}
func TestMissingAssetBuysAtFirstPrice(t *testing.T) {
	dates := enginetest.Dates("2023-01-02", 10)
	pricesA := make(map[string]float64, len(dates))
	pricesB := make(map[string]float64, len(dates))
	for i, d := range dates {
		pricesA[d] = 100
		if i >= 3 {
			pricesB[d] = 100 * math.Pow(1.01, float64(i-3))
		}
	}
	priceData := PriceDataMap{"A": pricesA, "B": pricesB}
	tradingDates := make([]time.Time, len(dates))
	for i, d := range dates {
		tradingDates[i], _ = time.Parse("2006-01-02", d)
	}
	pf := PortfolioInput{Name: "t", Assets: []AssetInput{{Ticker: "A", Weight: 50}, {Ticker: "B", Weight: 50}}}
	params := BacktestParams{StartingValue: 1000}
	curve, _, _, err := computeGrowthCurve(pf, priceData, nil, nil, tradingDates, params)
	if err != nil {
		t.Fatalf("computeGrowthCurve 返回错误: %v", err)
	}
	final := curve[len(curve)-1].Value
	want := 500 + 500*math.Pow(1.01, 6) // B 延迟到首个有价日买入并增长 6 个交易日
	if math.Abs(final-want) > 0.01 {
		t.Errorf("终值 = %.4f，期望 %.4f（缺失资产应延迟买入而非丢失分配）", final, want)
	}
}
func TestRebalanceOffset(t *testing.T) {
	// 11 个连续日历日 2023-01-02..01-12：B 于第 4 日起翻倍制造漂移；ISO 周切换在第 7 日（01-09）。
	dates := enginetest.Dates("2023-01-02", 11)
	priceA := make(map[string]float64, len(dates))
	priceB := make(map[string]float64, len(dates))
	for i, d := range dates {
		priceA[d] = 100
		if i < 4 {
			priceB[d] = 100
		} else {
			priceB[d] = 200
		}
	}
	priceData := PriceDataMap{"A": priceA, "B": priceB}
	tradingDates := make([]time.Time, len(dates))
	for i, d := range dates {
		tradingDates[i], _ = time.Parse("2006-01-02", d)
	}
	tests := []struct {
		name     string
		offset   int
		wantDate string
	}{
		{"无偏移在周界当日再平衡", 0, "2023-01-09"},
		{"偏移 3 延迟 3 个交易日后再平衡", 3, "2023-01-12"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pf := PortfolioInput{
				Name:               "t",
				Assets:             []AssetInput{{Ticker: "A", Weight: 50}, {Ticker: "B", Weight: 50}},
				RebalanceFrequency: "weekly",
				RebalanceOffset:    tt.offset,
			}
			_, allocHist, _, err := computeGrowthCurve(pf, priceData, nil, nil, tradingDates, BacktestParams{StartingValue: 1000})
			if err != nil {
				t.Fatalf("computeGrowthCurve 返回错误: %v", err)
			}
			reb := allocHist[len(allocHist)-1]
			if reb.Date != tt.wantDate {
				t.Fatalf("再平衡日 = %s，期望 %s（分配历史: %v）", reb.Date, tt.wantDate, allocHist)
			}
			assertFloatApprox(t, reb.Weights[0], 0.5, "权重 A")
			assertFloatApprox(t, reb.Weights[1], 0.5, "权重 B")
		})
	}
}
