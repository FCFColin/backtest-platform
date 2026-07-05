package engine

import (
	"testing"
	"time"
)

// ============================================================
// 单元测试
// ============================================================

// buildTestPriceData 构建测试用价格数据
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
			Portfolios: []PortfolioInput{
				{
					Name:               "60/40",
					Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
					RebalanceFrequency: "monthly",
					TotalReturn:        true,
				},
			},
			PriceData:     priceData,
			CPIData:       map[string]float64{},
			ExchangeRates: map[string]float64{},
			Params: BacktestParams{
				StartDate:           "2023-01-03",
				EndDate:             "2023-05-01",
				StartingValue:       10000,
				AdjustForInflation:  false,
				RollingWindowMonths: 12,
				BenchmarkTicker:     "VTI",
			},
		}

		result, err := RunBacktest(req)
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
			Portfolios: []PortfolioInput{
				{Name: "test", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}},
			},
			PriceData: buildTestPriceData(),
			Params: BacktestParams{
				StartDate: "2099-01-01",
				EndDate:   "2099-12-31",
			},
		}
		_, err := RunBacktest(req)
		if err == nil {
			t.Fatal("无数据日期范围应返回错误")
		}
	})
}

func TestParseTradingDates(t *testing.T) {
	t.Run("正常数据应返回排序日期", func(t *testing.T) {
		priceData := PriceDataMap{
			"VTI": {"2023-01-03": 100, "2023-01-04": 101, "2023-01-05": 102},
		}
		dates, err := parseTradingDates(priceData)
		if err != nil {
			t.Fatalf("parseTradingDates 返回错误: %v", err)
		}
		if len(dates) != 3 {
			t.Errorf("期望 3 个日期，实际 %d", len(dates))
		}
	})

	t.Run("空数据应返回空日期", func(t *testing.T) {
		dates, err := parseTradingDates(PriceDataMap{})
		if err != nil {
			t.Fatalf("空数据不应返回错误: %v", err)
		}
		if len(dates) != 0 {
			t.Errorf("期望 0 个日期，实际 %d", len(dates))
		}
	})
}

func TestFilterByDateRange(t *testing.T) {
	priceData := PriceDataMap{
		"VTI": {"2023-01-03": 100, "2023-01-04": 101, "2023-01-05": 102, "2023-01-06": 103},
	}
	dates, _ := parseTradingDates(priceData)

	t.Run("范围内过滤", func(t *testing.T) {
		filtered := filterByDateRange(dates, "2023-01-04", "2023-01-05")
		if len(filtered) != 2 {
			t.Errorf("期望 2 个日期，实际 %d", len(filtered))
		}
	})

	t.Run("空范围应返回空", func(t *testing.T) {
		filtered := filterByDateRange(dates, "2099-01-01", "2099-12-31")
		if len(filtered) != 0 {
			t.Errorf("期望 0 个日期，实际 %d", len(filtered))
		}
	})
}

// ============================================================
// 基准测试辅助函数
// ============================================================

// newBenchPriceData 创建用于基准测试的价格数据
//
// 企业理由：基准测试需要可重复的、接近生产规模的数据集。
// 3 个 ticker × 2520 个交易日（约 10 年），覆盖典型回测场景。
func newBenchPriceData() PriceDataMap {
	priceData := make(PriceDataMap, 3)
	tickers := []string{"VTI", "BND", "GLD"}

	for _, ticker := range tickers {
		prices := make(map[string]float64, 2520)
		base := 100.0
		for i := 0; i < 2520; i++ {
			date := time.Date(2014, 1, 2, 0, 0, 0, 0, time.UTC).
				AddDate(0, 0, i)
			// 跳过周末
			wd := date.Weekday()
			if wd == time.Saturday || wd == time.Sunday {
				continue
			}
			dateStr := date.Format("2006-01-02")
			// 简单的随机游走价格
			base *= 1.0 + 0.0003
			prices[dateStr] = base
		}
		priceData[ticker] = prices
	}

	return priceData
}

// newBenchBacktestRequest 创建用于基准测试的回测请求
func newBenchBacktestRequest() BacktestRequest {
	return BacktestRequest{
		Portfolios: []PortfolioInput{
			{
				Name:               "60/40",
				Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
				RebalanceFrequency: "monthly",
				Drag:               0,
				TotalReturn:        true,
			},
		},
		PriceData:     newBenchPriceData(),
		CPIData:       map[string]float64{},
		ExchangeRates: map[string]float64{},
		Params: BacktestParams{
			StartDate:           "2014-01-02",
			EndDate:             "2023-12-29",
			StartingValue:       10000,
			AdjustForInflation:  false,
			RollingWindowMonths: 12,
			BenchmarkTicker:     "VTI",
		},
	}
}

// BenchmarkRunBacktest 基准测试完整回测流程
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：无基准则无法判断优化效果，性能回归无法检测
// 权衡：基准测试增加CI时间约30秒，但防止性能退化
func BenchmarkRunBacktest(b *testing.B) {
	req := newBenchBacktestRequest()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := RunBacktest(req)
		if err != nil {
			b.Fatalf("RunBacktest failed: %v", err)
		}
	}
}

// BenchmarkComputeGrowthCurve 基准测试增长曲线计算
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：增长曲线是回测最耗时的部分，性能退化直接影响用户体验
func BenchmarkComputeGrowthCurve(b *testing.B) {
	req := newBenchBacktestRequest()
	tradingDates, _ := parseTradingDates(req.PriceData)
	tradingDates = filterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)

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

// BenchmarkComputeStatistics 基准测试统计指标计算
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：统计指标计算涉及大量数值运算，性能退化直接影响响应时间
func BenchmarkComputeStatistics(b *testing.B) {
	req := newBenchBacktestRequest()
	result, _ := RunBacktest(req)
	curve := result.Portfolios[0].GrowthCurve
	episodes := detectDrawdownEpisodes(curve)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		computeStatistics(curve, episodes, nil)
	}
}
