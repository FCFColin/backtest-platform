package optimizer

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"testing"
)

// buildOptimizerPriceData 构建优化器测试用的价格数据
//
// 企业理由：生成多资产价格序列，确保不同资产有不同的收益/波动特征，
// 以验证优化器在各种场景下的正确性。添加随机噪声使协方差矩阵非奇异。
func buildOptimizerPriceData(tickers []string, days int, startPrices []float64, dailyReturns []float64) map[string]map[string]float64 {
	rng := rand.New(rand.NewSource(42)) // 固定种子保证可复现
	priceData := make(map[string]map[string]float64)
	for i, ticker := range tickers {
		prices := make(map[string]float64)
		price := startPrices[i]
		for d := 0; d < days; d++ {
			date := dateFromDay(d)
			prices[date] = price
			// 添加随机噪声使收益率有波动，避免方差为 0
			noise := (rng.Float64() - 0.5) * 0.004 // ±0.2% 噪声
			price *= (1 + dailyReturns[i] + noise)
		}
		priceData[ticker] = prices
	}
	return priceData
}

// dateFromDay 将天数偏移转换为日期字符串
func dateFromDay(d int) string {
	base := []int{2023, 1, 3}
	for i := 0; i < d; i++ {
		base[2]++
		if base[2] > 28 {
			base[2] = 1
			base[1]++
			if base[1] > 12 {
				base[1] = 1
				base[0]++
			}
		}
	}
	return fmt.Sprintf("%d-%02d-%02d", base[0], base[1], base[2])
}

func TestOptimize(t *testing.T) {
	t.Run("空 tickers 应报错", func(t *testing.T) {
		_, err := Optimize(context.Background(), OptimizeRequest{
			Tickers:   []string{},
			PriceData: map[string]map[string]float64{},
			Objective: "maxSharpe",
		})
		if err == nil {
			t.Fatal("空 tickers 应返回错误")
		}
	})

	t.Run("不支持的优化目标应报错", func(t *testing.T) {
		priceData := buildOptimizerPriceData(
			[]string{"A", "B"}, 300,
			[]float64{100, 50},
			[]float64{0.001, 0.0005},
		)
		_, err := Optimize(context.Background(), OptimizeRequest{
			Tickers:   []string{"A", "B"},
			PriceData: priceData,
			Objective: "invalid",
		})
		if err == nil {
			t.Fatal("不支持的优化目标应返回错误")
		}
	})

	objectives := []struct {
		name       string
		objective  string
		checkValid func(t *testing.T, resp *OptimizeResponse)
	}{
		{
			name:      "最大夏普比",
			objective: "maxSharpe",
			checkValid: func(t *testing.T, resp *OptimizeResponse) {
				if resp.SharpeRatio == 0 {
					t.Error("最大夏普比优化结果 SharpeRatio 不应为 0")
				}
			},
		},
		{
			name:      "最小波动率",
			objective: "minVolatility",
			checkValid: func(t *testing.T, resp *OptimizeResponse) {
				if resp.ExpectedVolatility <= 0 {
					t.Error("最小波动率优化结果波动率应大于 0")
				}
			},
		},
		{
			name:      "最大收益",
			objective: "maxReturn",
			checkValid: func(t *testing.T, resp *OptimizeResponse) {
				if resp.ExpectedReturn <= 0 {
					t.Error("正收益资产最大收益优化结果收益应大于 0")
				}
			},
		},
	}

	for _, tt := range objectives {
		t.Run(tt.name, func(t *testing.T) {
			priceData := buildOptimizerPriceData(
				[]string{"A", "B", "C"}, 300,
				[]float64{100, 50, 75},
				[]float64{0.001, 0.0005, 0.0008},
			)
			resp, err := Optimize(context.Background(), OptimizeRequest{
				Tickers:       []string{"A", "B", "C"},
				PriceData:     priceData,
				Objective:     tt.objective,
				NumIterations: 1000,
			})
			if err != nil {
				t.Fatalf("Optimize 返回错误: %v", err)
			}
			if len(resp.OptimalWeights) != 3 {
				t.Errorf("期望 3 个权重，实际 %d", len(resp.OptimalWeights))
			}
			sumW := 0.0
			for _, w := range resp.OptimalWeights {
				sumW += w
			}
			if math.Abs(sumW-1.0) > 0.01 {
				t.Errorf("权重和应接近 1，实际 %.4f", sumW)
			}
			if resp.ExpectedVolatility < 0 {
				t.Errorf("波动率应非负，实际 %.4f", resp.ExpectedVolatility)
			}
			tt.checkValid(t, resp)
		})
	}

	t.Run("约束条件应被遵守", func(t *testing.T) {
		priceData := buildOptimizerPriceData(
			[]string{"A", "B"}, 300,
			[]float64{100, 50},
			[]float64{0.001, 0.0005},
		)
		resp, err := Optimize(context.Background(), OptimizeRequest{
			Tickers:       []string{"A", "B"},
			PriceData:     priceData,
			Objective:     "maxSharpe",
			Constraints:   Constraints{MinWeight: 0.2, MaxWeight: 0.8},
			NumIterations: 1000,
		})
		if err != nil {
			t.Fatalf("Optimize 返回错误: %v", err)
		}
		for ticker, w := range resp.OptimalWeights {
			if w < 0.2-1e-6 || w > 0.8+1e-6 {
				t.Errorf("权重约束违反：ticker=%s, weight=%.4f, 约束 [0.2, 0.8]", ticker, w)
			}
		}
	})
}

func TestComputeEfficientFrontier(t *testing.T) {
	t.Run("空 tickers 应报错", func(t *testing.T) {
		_, err := ComputeEfficientFrontier(context.Background(), FrontierRequest{
			Tickers:   []string{},
			PriceData: map[string]map[string]float64{},
		})
		if err == nil {
			t.Fatal("空 tickers 应返回错误")
		}
	})

	t.Run("有效前沿点数正确", func(t *testing.T) {
		priceData := buildOptimizerPriceData(
			[]string{"A", "B"}, 300,
			[]float64{100, 50},
			[]float64{0.001, 0.0005},
		)
		resp, err := ComputeEfficientFrontier(context.Background(), FrontierRequest{
			Tickers:   []string{"A", "B"},
			PriceData: priceData,
			NumPoints: 10,
		})
		if err != nil {
			t.Fatalf("ComputeEfficientFrontier 返回错误: %v", err)
		}
		if len(resp.Frontier) != 10 {
			t.Errorf("期望 10 个前沿点，实际 %d", len(resp.Frontier))
		}
		for i := 1; i < len(resp.Frontier); i++ {
			if resp.Frontier[i].ExpectedVolatility < resp.Frontier[i-1].ExpectedVolatility-0.01 {
				t.Logf("前沿点 %d 波动率 %.4f < 前沿点 %d 波动率 %.4f",
					i, resp.Frontier[i].ExpectedVolatility,
					i-1, resp.Frontier[i-1].ExpectedVolatility)
			}
		}
	})

	t.Run("前沿点权重和接近 1", func(t *testing.T) {
		priceData := buildOptimizerPriceData(
			[]string{"A", "B", "C"}, 300,
			[]float64{100, 50, 75},
			[]float64{0.001, 0.0005, 0.0008},
		)
		resp, err := ComputeEfficientFrontier(context.Background(), FrontierRequest{
			Tickers:   []string{"A", "B", "C"},
			PriceData: priceData,
			NumPoints: 5,
		})
		if err != nil {
			t.Fatalf("ComputeEfficientFrontier 返回错误: %v", err)
		}
		for i, pt := range resp.Frontier {
			sumW := 0.0
			for _, w := range pt.Weights {
				sumW += w
			}
			if math.Abs(sumW-1.0) > 0.01 {
				t.Errorf("前沿点 %d 权重和 %.4f 偏离 1", i, sumW)
			}
		}
	})
}

func TestComputeReturnCovariance(t *testing.T) {
	errorCases := []struct {
		name      string
		tickers   []string
		priceData map[string]map[string]float64
		errMsg    string
	}{
		{"价格数据为空应报错", []string{"A"}, map[string]map[string]float64{"A": {}}, "空价格数据应返回错误"},
		{"对齐后不足 2 天应报错", []string{"A", "B"}, map[string]map[string]float64{
			"A": {"2023-01-03": 100.0},
			"B": {"2023-01-03": 50.0},
		}, "不足 2 天数据应返回错误"},
	}
	for _, tc := range errorCases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := computeReturnCovariance(tc.tickers, tc.priceData)
			if err == nil {
				t.Fatal(tc.errMsg)
			}
		})
	}

	t.Run("正常收益率和协方差计算", func(t *testing.T) {
		priceData := buildOptimizerPriceData(
			[]string{"A", "B"}, 300,
			[]float64{100, 50},
			[]float64{0.001, 0.0005},
		)
		mu, sigma, err := computeReturnCovariance([]string{"A", "B"}, priceData)
		if err != nil {
			t.Fatalf("computeReturnCovariance 返回错误: %v", err)
		}
		if len(mu) != 2 {
			t.Fatalf("期望 2 个期望收益，实际 %d", len(mu))
		}
		if len(sigma) != 2 || len(sigma[0]) != 2 {
			t.Fatalf("期望 2x2 协方差矩阵")
		}
		if mu[0] <= mu[1] {
			t.Errorf("A 收益率 %.4f 应高于 B 收益率 %.4f", mu[0], mu[1])
		}
		if sigma[0][0] <= 0 || sigma[1][1] <= 0 {
			t.Errorf("方差应大于 0：A=%.6f, B=%.6f", sigma[0][0], sigma[1][1])
		}
		if math.Abs(sigma[0][1]-sigma[1][0]) > 1e-10 {
			t.Errorf("协方差矩阵不对称：sigma[0][1]=%.6f, sigma[1][0]=%.6f", sigma[0][1], sigma[1][0])
		}
	})
}