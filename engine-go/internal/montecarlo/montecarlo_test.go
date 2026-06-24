package montecarlo

import (
	"testing"
	"time"

	"engine-go/internal/engine"
)

// ============================================================
// 单元测试
// ============================================================

// buildTestMCPriceData 构建测试用价格数据
func buildTestMCPriceData() engine.PriceDataMap {
	priceData := make(engine.PriceDataMap, 3)
	tickers := []string{"VTI", "BND", "GLD"}
	bases := []float64{100, 50, 80}

	for idx, ticker := range tickers {
		prices := make(map[string]float64, 500)
		base := bases[idx]
		for i := 0; i < 500; i++ {
			date := time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)
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

func TestRunMonteCarlo(t *testing.T) {
	t.Run("基本蒙特卡洛模拟应成功", func(t *testing.T) {
		req := MonteCarloRequest{
			Portfolio: MCPortfolioInput{
				Name:               "60/40",
				Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
				RebalanceFrequency: "monthly",
				TotalReturn:        true,
			},
			PriceData: buildTestMCPriceData(),
			Params: MCBacktestParams{
				StartDate:           "2020-01-02",
				EndDate:             "2021-12-31",
				StartingValue:       10000,
				AdjustForInflation:  false,
				RollingWindowMonths: 12,
			},
			MCParams: MCSimParams{
				NumSimulations:   10,
				NumYears:         5,
				MinBlockYears:    1,
				MaxBlockYears:    2,
				WithReplacement:  true,
				SuccessThreshold: 1.0,
			},
		}

		result, err := RunMonteCarlo(req)
		if err != nil {
			t.Fatalf("RunMonteCarlo 返回错误: %v", err)
		}
		if len(result.PerPathMetrics) != 10 {
			t.Errorf("期望 10 条模拟路径指标，实际 %d", len(result.PerPathMetrics))
		}
	})

	t.Run("空资产应报错", func(t *testing.T) {
		req := MonteCarloRequest{
			Portfolio: MCPortfolioInput{
				Name:   "empty",
				Assets: []AssetInput{},
			},
			PriceData: buildTestMCPriceData(),
			Params: MCBacktestParams{
				StartDate:     "2020-01-02",
				EndDate:       "2021-12-31",
				StartingValue: 10000,
			},
			MCParams: MCSimParams{
				NumSimulations: 10,
				NumYears:       5,
			},
		}
		_, err := RunMonteCarlo(req)
		if err == nil {
			t.Fatal("空资产应返回错误")
		}
	})
}

func TestComputePortfolioDailyReturns(t *testing.T) {
	t.Run("正常计算应返回收益率序列", func(t *testing.T) {
		portfolio := MCPortfolioInput{
			Name:               "test",
			Assets:             []AssetInput{{Ticker: "VTI", Weight: 100}},
			RebalanceFrequency: "none",
			TotalReturn:        true,
		}
		params := MCBacktestParams{
			StartDate:     "2020-01-02",
			EndDate:       "2021-06-30",
			StartingValue: 10000,
		}
		returns, err := computePortfolioDailyReturns(portfolio, buildTestMCPriceData(), params)
		if err != nil {
			t.Fatalf("computePortfolioDailyReturns 返回错误: %v", err)
		}
		if len(returns) == 0 {
			t.Error("收益率序列不应为空")
		}
	})
}

// ============================================================
// 基准测试辅助函数
// ============================================================

// newBenchMCPriceData 创建用于蒙特卡洛基准测试的价格数据
//
// 企业理由：基准测试需要可重复的、接近生产规模的数据集。
// 3 个 ticker × 2520 个交易日（约 10 年），覆盖典型蒙特卡洛场景。
func newBenchMCPriceData() engine.PriceDataMap {
	priceData := make(engine.PriceDataMap, 3)
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

// newBenchMCRequest 创建用于基准测试的蒙特卡洛请求
func newBenchMCRequest() MonteCarloRequest {
	return MonteCarloRequest{
		Portfolio: MCPortfolioInput{
			Name:               "60/40",
			Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
			RebalanceFrequency: "monthly",
			Drag:               0,
			TotalReturn:        true,
		},
		PriceData: newBenchMCPriceData(),
		Params: MCBacktestParams{
			StartDate:           "2014-01-02",
			EndDate:             "2023-12-29",
			StartingValue:       10000,
			AdjustForInflation:  false,
			RollingWindowMonths: 12,
			BenchmarkTicker:     "",
		},
		MCParams: MCSimParams{
			NumSimulations:   100,
			NumYears:         10,
			MinBlockYears:    1,
			MaxBlockYears:    5,
			WithReplacement:  true,
			BlockSize:        0,
			SuccessThreshold: 1.0,
		},
	}
}

// BenchmarkRunMonteCarlo 基准测试蒙特卡洛模拟
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：蒙特卡洛模拟是计算密集型操作，性能退化直接影响用户体验
// 权衡：基准测试增加CI时间约30秒，但防止性能退化
func BenchmarkRunMonteCarlo(b *testing.B) {
	req := newBenchMCRequest()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := RunMonteCarlo(req)
		if err != nil {
			b.Fatalf("RunMonteCarlo failed: %v", err)
		}
	}
}

// BenchmarkComputePortfolioDailyReturns 基准测试组合日收益率计算
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：日收益率计算是蒙特卡洛的输入基础，性能退化影响整体流程
func BenchmarkComputePortfolioDailyReturns(b *testing.B) {
	req := newBenchMCRequest()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := computePortfolioDailyReturns(req.Portfolio, req.PriceData, req.Params)
		if err != nil {
			b.Fatalf("computePortfolioDailyReturns failed: %v", err)
		}
	}
}
