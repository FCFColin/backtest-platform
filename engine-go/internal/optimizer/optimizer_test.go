package optimizer

import (
	"context"
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
	return sprintfDate(base[0], base[1], base[2])
}

func sprintfDate(y, m, d int) string {
	return padZero(y) + "-" + padZero(m) + "-" + padZero(d)
}

func padZero(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
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
			// 权重数量应与 tickers 数量一致
			if len(resp.OptimalWeights) != 3 {
				t.Errorf("期望 3 个权重，实际 %d", len(resp.OptimalWeights))
			}
			// 权重和应接近 1
			sumW := 0.0
			for _, w := range resp.OptimalWeights {
				sumW += w
			}
			if math.Abs(sumW-1.0) > 0.01 {
				t.Errorf("权重和应接近 1，实际 %.4f", sumW)
			}
			// 波动率应非负
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
		// 前沿点波动率应递增（大致趋势）
		for i := 1; i < len(resp.Frontier); i++ {
			if resp.Frontier[i].ExpectedVolatility < resp.Frontier[i-1].ExpectedVolatility-0.01 {
				// 允许小误差，但不应大幅递减
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
	t.Run("价格数据为空应报错", func(t *testing.T) {
		_, _, err := computeReturnCovariance([]string{"A"}, map[string]map[string]float64{
			"A": {},
		})
		if err == nil {
			t.Fatal("空价格数据应返回错误")
		}
	})

	t.Run("对齐后不足 2 天应报错", func(t *testing.T) {
		_, _, err := computeReturnCovariance([]string{"A", "B"}, map[string]map[string]float64{
			"A": {"2023-01-03": 100.0},
			"B": {"2023-01-03": 50.0},
		})
		if err == nil {
			t.Fatal("不足 2 天数据应返回错误")
		}
	})

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
		// A 的日收益率更高，年化收益应更高
		if mu[0] <= mu[1] {
			t.Errorf("A 收益率 %.4f 应高于 B 收益率 %.4f", mu[0], mu[1])
		}
		// 协方差矩阵对角线为方差，应大于 0
		if sigma[0][0] <= 0 || sigma[1][1] <= 0 {
			t.Errorf("方差应大于 0：A=%.6f, B=%.6f", sigma[0][0], sigma[1][1])
		}
		// 协方差矩阵应对称
		if math.Abs(sigma[0][1]-sigma[1][0]) > 1e-10 {
			t.Errorf("协方差矩阵不对称：sigma[0][1]=%.6f, sigma[1][0]=%.6f", sigma[0][1], sigma[1][0])
		}
	})
}

func TestInvertMatrix(t *testing.T) {
	t.Run("单位矩阵的逆应为单位矩阵", func(t *testing.T) {
		identity := [][]float64{{1, 0}, {0, 1}}
		inv, err := invertMatrix(identity)
		if err != nil {
			t.Fatalf("invertMatrix 返回错误: %v", err)
		}
		if math.Abs(inv[0][0]-1.0) > 1e-10 || math.Abs(inv[1][1]-1.0) > 1e-10 {
			t.Errorf("单位矩阵的逆对角线应为 1，实际 %.6f, %.6f", inv[0][0], inv[1][1])
		}
		if math.Abs(inv[0][1]) > 1e-10 || math.Abs(inv[1][0]) > 1e-10 {
			t.Errorf("单位矩阵的逆非对角线应为 0，实际 %.6f, %.6f", inv[0][1], inv[1][0])
		}
	})

	t.Run("奇异矩阵应报错", func(t *testing.T) {
		singular := [][]float64{{1, 2}, {2, 4}} // 行线性相关
		_, err := invertMatrix(singular)
		if err == nil {
			t.Fatal("奇异矩阵应返回错误")
		}
	})

	t.Run("空矩阵应报错", func(t *testing.T) {
		_, err := invertMatrix([][]float64{})
		if err == nil {
			t.Fatal("空矩阵应返回错误")
		}
	})

	t.Run("3x3 矩阵求逆验证", func(t *testing.T) {
		a := [][]float64{
			{2, 1, 0},
			{1, 3, 1},
			{0, 1, 2},
		}
		inv, err := invertMatrix(a)
		if err != nil {
			t.Fatalf("invertMatrix 返回错误: %v", err)
		}
		// A * A^(-1) 应约等于 I
		for i := 0; i < 3; i++ {
			for j := 0; j < 3; j++ {
				dot := 0.0
				for k := 0; k < 3; k++ {
					dot += a[i][k] * inv[k][j]
				}
				expected := 0.0
				if i == j {
					expected = 1.0
				}
				if math.Abs(dot-expected) > 1e-8 {
					t.Errorf("A*A^(-1)[%d][%d] = %.6f，期望 %.6f", i, j, dot, expected)
				}
			}
		}
	})
}

func TestIsPositiveDefinite(t *testing.T) {
	tests := []struct {
		name     string
		matrix   [][]float64
		expected bool
	}{
		{
			name:     "单位矩阵是正定的",
			matrix:   [][]float64{{1, 0}, {0, 1}},
			expected: true,
		},
		{
			name:     "对角正矩阵是正定的",
			matrix:   [][]float64{{2, 0}, {0, 3}},
			expected: true,
		},
		{
			name:     "有负特征值的矩阵不是正定的",
			matrix:   [][]float64{{-1, 0}, {0, 1}},
			expected: false,
		},
		{
			name:     "零矩阵不是正定的",
			matrix:   [][]float64{{0, 0}, {0, 0}},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isPositiveDefinite(tt.matrix)
			if result != tt.expected {
				t.Errorf("期望 %v，实际 %v", tt.expected, result)
			}
		})
	}
}

func TestEnsurePositiveDefinite(t *testing.T) {
	t.Run("正定矩阵不应被修改", func(t *testing.T) {
		pd := [][]float64{{2, 0}, {0, 3}}
		result := ensurePositiveDefinite(pd)
		if math.Abs(result[0][0]-2.0) > 1e-10 || math.Abs(result[1][1]-3.0) > 1e-10 {
			t.Error("正定矩阵不应被正则化修改")
		}
	})

	t.Run("非正定矩阵应被正则化", func(t *testing.T) {
		// 构造一个几乎非正定的矩阵
		nonPD := [][]float64{{0.001, 0}, {0, 0.001}}
		result := ensurePositiveDefinite(nonPD)
		if !isPositiveDefinite(result) {
			t.Error("正则化后矩阵应为正定")
		}
	})
}

func TestPortfolioMetrics(t *testing.T) {
	t.Run("等权组合指标", func(t *testing.T) {
		w := []float64{0.5, 0.5}
		mu := []float64{0.10, 0.05}
		sigma := [][]float64{{0.04, 0.01}, {0.01, 0.02}}
		ret, vol, sharpe := portfolioMetrics(w, mu, sigma)
		// 期望收益 = 0.5*0.10 + 0.5*0.05 = 0.075
		if math.Abs(ret-0.075) > 1e-10 {
			t.Errorf("期望收益应为 0.075，实际 %.6f", ret)
		}
		if vol <= 0 {
			t.Errorf("波动率应大于 0，实际 %.6f", vol)
		}
		if sharpe == 0 && vol > 0 {
			t.Error("有波动率时 Sharpe 不应为 0")
		}
	})
}

func TestSatisfiesConstraints(t *testing.T) {
	tests := []struct {
		name        string
		weights     []float64
		constraints Constraints
		expected    bool
	}{
		{"无约束满足", []float64{0.5, 0.5}, Constraints{MinWeight: 0, MaxWeight: 1}, true},
		{"低于最小权重", []float64{0.1, 0.9}, Constraints{MinWeight: 0.2, MaxWeight: 1}, false},
		{"超过最大权重", []float64{0.9, 0.1}, Constraints{MinWeight: 0, MaxWeight: 0.8}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := satisfiesConstraints(tt.weights, tt.constraints)
			if result != tt.expected {
				t.Errorf("期望 %v，实际 %v", tt.expected, result)
			}
		})
	}
}

func TestIsValidPortfolio(t *testing.T) {
	tests := []struct {
		name     string
		weights  []float64
		expected bool
	}{
		{"有效组合", []float64{0.6, 0.4}, true},
		{"权重和不为 1", []float64{0.5, 0.3}, false},
		{"负权重", []float64{-0.1, 1.1}, false},
		{"等权组合", []float64{0.333, 0.333, 0.334}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidPortfolio(tt.weights)
			if result != tt.expected {
				t.Errorf("期望 %v，实际 %v", tt.expected, result)
			}
		})
	}
}

func TestOptimizeMaxReturn(t *testing.T) {
	t.Run("最高收益资产应获得最大权重", func(t *testing.T) {
		mu := []float64{0.05, 0.15, 0.10}
		c := Constraints{MinWeight: 0, MaxWeight: 1}
		w := optimizeMaxReturn(mu, c)
		// 第二个资产收益最高，应获得最大权重
		if w[1] < w[0] || w[1] < w[2] {
			t.Errorf("最高收益资产应获得最大权重：w=[%.4f, %.4f, %.4f]", w[0], w[1], w[2])
		}
		// 权重和应接近 1
		sumW := 0.0
		for _, v := range w {
			sumW += v
		}
		if math.Abs(sumW-1.0) > 0.01 {
			t.Errorf("权重和应接近 1，实际 %.4f", sumW)
		}
	})

	t.Run("约束 MaxWeight 应被遵守", func(t *testing.T) {
		mu := []float64{0.05, 0.15, 0.10}
		c := Constraints{MinWeight: 0, MaxWeight: 0.5}
		w := optimizeMaxReturn(mu, c)
		for i, v := range w {
			if v > c.MaxWeight+1e-6 {
				t.Errorf("权重 %d = %.4f 超过 MaxWeight %.4f", i, v, c.MaxWeight)
			}
		}
	})
}

func TestCovariance(t *testing.T) {
	t.Run("相同序列协方差等于方差", func(t *testing.T) {
		x := []float64{1.0, 2.0, 3.0, 4.0, 5.0}
		cov := covariance(x, x)
		// 计算方差
		m := 0.0
		for _, v := range x {
			m += v
		}
		m /= float64(len(x))
		var variance float64
		for _, v := range x {
			variance += (v - m) * (v - m)
		}
		variance /= float64(len(x) - 1)
		if math.Abs(cov-variance) > 1e-10 {
			t.Errorf("相同序列协方差应等于方差：cov=%.6f, var=%.6f", cov, variance)
		}
	})

	t.Run("空序列应返回 0", func(t *testing.T) {
		cov := covariance([]float64{}, []float64{})
		if cov != 0 {
			t.Errorf("空序列协方差应返回 0，实际 %.6f", cov)
		}
	})
}

func TestClipWeights(t *testing.T) {
	t.Run("裁剪后权重和应接近 1", func(t *testing.T) {
		w := []float64{0.8, 0.3} // 和为 1.1
		c := Constraints{MinWeight: 0, MaxWeight: 0.7}
		result := clipWeights(w, c)
		sumW := 0.0
		for _, v := range result {
			sumW += v
		}
		if math.Abs(sumW-1.0) > 0.01 {
			t.Errorf("裁剪后权重和应接近 1，实际 %.4f", sumW)
		}
	})
}

func TestProjectWeights(t *testing.T) {
	t.Run("投影后应满足约束", func(t *testing.T) {
		w := []float64{0.9, 0.2} // 超过 MaxWeight
		c := Constraints{MinWeight: 0, MaxWeight: 0.7}
		result := projectWeights(w, c)
		for i, v := range result {
			if v < c.MinWeight-1e-6 || v > c.MaxWeight+1e-6 {
				t.Errorf("权重 %d = %.4f 不在约束 [%.2f, %.2f] 内", i, v, c.MinWeight, c.MaxWeight)
			}
		}
	})
}
