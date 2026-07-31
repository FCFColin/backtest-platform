package engine

import (
	"context"
	"engine-go/internal/engineutil"
	"testing"
	"time"
)

func buildTestPriceData() PriceDataMap {
	priceData := make(PriceDataMap, 3)
	tickers := []string{"VTI", "BND", "GLD"}
	bases := []float64{100, 50, 80}
	for idx, ticker := range tickers {
		prices := make(map[string]float64, 100)
		base := bases[idx]
		for i := 0; i < 100; i++ {
			date := time.Date(2023, 1, 3, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)
			wd := date.Weekday()
			if wd == time.Saturday || wd == time.Sunday {
				continue
			}
			prices[date.Format("2006-01-02")] = base
			base *= 1.0003
		}
		priceData[ticker] = prices
	}
	return priceData
}
func TestRunBacktest(t *testing.T) {
	t.Run("基本回测应成功", func(t *testing.T) {
		priceData := buildTestPriceData()
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
		req := BacktestRequest{
			Portfolios: []PortfolioInput{{Name: "test", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}}},
			PriceData:  buildTestPriceData(),
			Params:     BacktestParams{StartDate: "2099-01-01", EndDate: "2099-12-31"},
		}
		_, err := RunBacktest(context.Background(), req)
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
func newBenchPriceData() PriceDataMap {
	priceData := make(PriceDataMap, 3)
	tickers := []string{"VTI", "BND", "GLD"}
	for _, ticker := range tickers {
		prices := make(map[string]float64, 2520)
		base := 100.0
		for i := 0; i < 2520; i++ {
			date := time.Date(2014, 1, 2, 0, 0, 0, 0, time.UTC).
				AddDate(0, 0, i)
			wd := date.Weekday()
			if wd == time.Saturday || wd == time.Sunday {
				continue
			}
			dateStr := date.Format("2006-01-02")
			base *= 1.0 + 0.0003
			prices[dateStr] = base
		}
		priceData[ticker] = prices
	}
	return priceData
}
func newBenchBacktestRequest() BacktestRequest {
	return BacktestRequest{
		Portfolios: []PortfolioInput{{Name: "60/40",
			Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
			RebalanceFrequency: "monthly", Drag: 0, TotalReturn: true,
		},
		},
		PriceData:     newBenchPriceData(),
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
