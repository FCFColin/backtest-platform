package montecarlo

import (
	"context"
	"engine-go/internal/enginetest"
	"math"
	"slices"
	"testing"
	"time"
)

func TestRunMonteCarlo(t *testing.T) {
	t.Run("基本蒙特卡洛模拟应成功", func(t *testing.T) {
		req := MonteCarloRequest{
			Portfolio: MCPortfolioInput{Name: "60/40",
				Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
				RebalanceFrequency: "monthly", TotalReturn: true,
			},
			PriceData: enginetest.ThreeTickerData(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC), 500, 0.0003),
			Params:    MCBacktestParams{StartDate: "2020-01-02", EndDate: "2021-12-31", StartingValue: 10000, AdjustForInflation: false, RollingWindowMonths: 12},
			MCParams:  MCSimParams{NumSimulations: 10, NumYears: 5, MinBlockYears: 1, MaxBlockYears: 2, SuccessThreshold: 1.0},
		}
		result, err := RunMonteCarlo(context.Background(), req)
		if err != nil {
			t.Fatalf("RunMonteCarlo 返回错误: %v", err)
		}
		if len(result.PerPathMetrics) != 10 {
			t.Errorf("期望 10 条模拟路径指标，实际 %d", len(result.PerPathMetrics))
		}
	})
	t.Run("空资产应报错", func(t *testing.T) {
		req := MonteCarloRequest{
			Portfolio: MCPortfolioInput{Name: "empty", Assets: []AssetInput{}},
			PriceData: enginetest.ThreeTickerData(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC), 500, 0.0003),
			Params:    MCBacktestParams{StartDate: "2020-01-02", EndDate: "2021-12-31", StartingValue: 10000},
			MCParams:  MCSimParams{NumSimulations: 10, NumYears: 5},
		}
		_, err := RunMonteCarlo(context.Background(), req)
		if err == nil {
			t.Fatal("空资产应返回错误")
		}
	})
	t.Run("固定 seed 结果可复现", func(t *testing.T) {
		seed := int64(42)
		req := MonteCarloRequest{
			Portfolio: MCPortfolioInput{Name: "60/40",
				Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
				RebalanceFrequency: "monthly", TotalReturn: true,
			},
			PriceData: enginetest.ThreeTickerData(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC), 500, 0.0003),
			Params:    MCBacktestParams{StartDate: "2020-01-02", EndDate: "2021-12-31", StartingValue: 10000},
			MCParams:  MCSimParams{NumSimulations: 20, NumYears: 5, MinBlockYears: 1, MaxBlockYears: 2, Seed: &seed},
		}
		r1, err1 := RunMonteCarlo(context.Background(), req)
		if err1 != nil {
			t.Fatalf("RunMonteCarlo 返回错误: %v", err1)
		}
		r2, err2 := RunMonteCarlo(context.Background(), req)
		if err2 != nil {
			t.Fatalf("RunMonteCarlo 返回错误: %v", err2)
		}
		if r1.Statistics.MeanFinalValue != r2.Statistics.MeanFinalValue {
			t.Errorf("固定 seed 时统计不可复现: %v != %v", r1.Statistics.MeanFinalValue, r2.Statistics.MeanFinalValue)
		}
		if !slices.Equal(r1.FinalDistribution, r2.FinalDistribution) {
			t.Error("固定 seed 时终值分布不可复现")
		}
	})
}
func TestComputePortfolioDailyReturns(t *testing.T) {
	t.Run("正常计算应返回收益率序列", func(t *testing.T) {
		portfolio := MCPortfolioInput{Name: "test", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}, RebalanceFrequency: "none", TotalReturn: true}
		params := MCBacktestParams{StartDate: "2020-01-02", EndDate: "2021-06-30", StartingValue: 10000}
		returns, err := computePortfolioDailyReturns(portfolio, enginetest.ThreeTickerData(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC), 500, 0.0003), params)
		if err != nil {
			t.Fatalf("computePortfolioDailyReturns 返回错误: %v", err)
		}
		if len(returns) == 0 {
			t.Error("收益率序列不应为空")
		}
	})
	t.Run("drag 为年化百分比按日复利摊薄（与回测口径一致，非原始百分比直减）", func(t *testing.T) {
		portfolio := MCPortfolioInput{Name: "test", Assets: []AssetInput{{Ticker: "VTI", Weight: 100}}, RebalanceFrequency: "none", Drag: 100, TotalReturn: true}
		params := MCBacktestParams{StartDate: "2020-01-02", EndDate: "2021-06-30", StartingValue: 10000}
		returns, err := computePortfolioDailyReturns(portfolio, enginetest.PriceData([]string{"VTI"}, []float64{100}, time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC), 300, 0), params)
		if err != nil {
			t.Fatalf("computePortfolioDailyReturns 返回错误: %v", err)
		}
		for i, r := range returns {
			if got := math.Abs(r + 1.0); got > 1e-9 {
				t.Errorf("Drag=100 时日收益应完全回撤（%v），第 %d 天为 %v", r, i, r)
			}
		}
	})
}
func newBenchMCRequest() MonteCarloRequest {
	return MonteCarloRequest{
		Portfolio: MCPortfolioInput{Name: "60/40",
			Assets:             []AssetInput{{Ticker: "VTI", Weight: 60}, {Ticker: "BND", Weight: 40}},
			RebalanceFrequency: "monthly", Drag: 0, TotalReturn: true,
		},
		PriceData: enginetest.ThreeTickerData(time.Date(2014, 1, 2, 0, 0, 0, 0, time.UTC), 2520, 0.0003),
		Params:    MCBacktestParams{StartDate: "2014-01-02", EndDate: "2023-12-29", StartingValue: 10000, AdjustForInflation: false, RollingWindowMonths: 12, BenchmarkTicker: ""},
		MCParams:  MCSimParams{NumSimulations: 100, NumYears: 10, MinBlockYears: 1, MaxBlockYears: 5, SuccessThreshold: 1.0},
	}
}
func BenchmarkRunMonteCarlo(b *testing.B) {
	req := newBenchMCRequest()
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, err := RunMonteCarlo(context.Background(), req)
		if err != nil {
			b.Fatalf("RunMonteCarlo failed: %v", err)
		}
	}
}
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
