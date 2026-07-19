package optimizer

import (
	"math"
	"testing"
)

func TestInvertDense(t *testing.T) {
	errorCases := []struct {
		name   string
		matrix [][]float64
		errMsg string
	}{
		{"奇异矩阵应报错", [][]float64{{1, 2}, {2, 4}}, "奇异矩阵应返回错误"},
		{"空矩阵应报错", [][]float64{}, "空矩阵应返回错误"},
	}
	for _, tc := range errorCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := invertDense(tc.matrix)
			if err == nil {
				t.Fatal(tc.errMsg)
			}
		})
	}

	t.Run("单位矩阵的逆应为单位矩阵", func(t *testing.T) {
		identity := [][]float64{{1, 0}, {0, 1}}
		inv, err := invertDense(identity)
		if err != nil {
			t.Fatalf("invertDense 返回错误: %v", err)
		}
		if math.Abs(inv[0][0]-1.0) > 1e-10 || math.Abs(inv[1][1]-1.0) > 1e-10 {
			t.Errorf("单位矩阵的逆对角线应为 1，实际 %.6f, %.6f", inv[0][0], inv[1][1])
		}
		if math.Abs(inv[0][1]) > 1e-10 || math.Abs(inv[1][0]) > 1e-10 {
			t.Errorf("单位矩阵的逆非对角线应为 0，实际 %.6f, %.6f", inv[0][1], inv[1][0])
		}
	})

	t.Run("3x3 矩阵求逆验证", func(t *testing.T) {
		a := [][]float64{
			{2, 1, 0},
			{1, 3, 1},
			{0, 1, 2},
		}
		inv, err := invertDense(a)
		if err != nil {
			t.Fatalf("invertDense 返回错误: %v", err)
		}
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

func TestIsPD(t *testing.T) {
	tests := []struct {
		name     string
		matrix   [][]float64
		expected bool
	}{
		{"单位矩阵是正定的", [][]float64{{1, 0}, {0, 1}}, true},
		{"对角正矩阵是正定的", [][]float64{{2, 0}, {0, 3}}, true},
		{"有负特征值的矩阵不是正定的", [][]float64{{-1, 0}, {0, 1}}, false},
		{"零矩阵不是正定的", [][]float64{{0, 0}, {0, 0}}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isPD(tt.matrix)
			if result != tt.expected {
				t.Errorf("期望 %v，实际 %v", tt.expected, result)
			}
		})
	}
}

func TestEnsurePD(t *testing.T) {
	t.Run("正定矩阵不应被修改", func(t *testing.T) {
		pd := [][]float64{{2, 0}, {0, 3}}
		result := ensurePD(pd)
		if math.Abs(result[0][0]-2.0) > 1e-10 || math.Abs(result[1][1]-3.0) > 1e-10 {
			t.Error("正定矩阵不应被正则化修改")
		}
	})

	t.Run("非正定矩阵应被正则化", func(t *testing.T) {
		// 构造一个几乎非正定的矩阵
		nonPD := [][]float64{{0.001, 0}, {0, 0.001}}
		result := ensurePD(nonPD)
		if !isPD(result) {
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