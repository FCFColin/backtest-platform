package pca

import (
	"math"
	"testing"
)

func TestPerformPCA_InsufficientData(t *testing.T) {
	t.Run("空tickers返回错误", func(t *testing.T) {
		req := PCARequest{
			Tickers:   []string{},
			PriceData: map[string]map[string]float64{},
		}
		r, err := PerformPCA(req)
		if err == nil {
			t.Errorf("应返回错误, got result=%+v", r)
		}
		if r != nil {
			t.Errorf("错误时应返回 nil result, got %+v", r)
		}
	})

	t.Run("PriceData为空返回错误", func(t *testing.T) {
		req := PCARequest{
			Tickers:   []string{"A", "B"},
			PriceData: map[string]map[string]float64{},
		}
		if _, err := PerformPCA(req); err == nil {
			t.Errorf("应返回错误")
		}
	})

	t.Run("仅1个交易日返回错误", func(t *testing.T) {
		req := PCARequest{
			Tickers: []string{"A", "B"},
			PriceData: map[string]map[string]float64{
				"A": {"2024-01-01": 100},
				"B": {"2024-01-01": 100},
			},
		}
		if _, err := PerformPCA(req); err == nil {
			t.Errorf("至少需要2个交易日, 应返回错误")
		}
	})
}

func TestPerformPCA_SingleTicker(t *testing.T) {
	req := PCARequest{
		Tickers: []string{"A"},
		PriceData: map[string]map[string]float64{
			"A": {
				"2024-01-01": 100,
				"2024-01-02": 110,
				"2024-01-03": 105,
				"2024-01-04": 115,
			},
		},
	}
	r, err := PerformPCA(req)
	if err != nil {
		t.Fatalf("单 ticker 不应报错: %v", err)
	}
	if len(r.Eigenvalues) != 1 {
		t.Errorf("应有 1 个特征值, got %d", len(r.Eigenvalues))
	}
	if len(r.CumulativeVariance) != 1 {
		t.Errorf("应有 1 个累计方差, got %d", len(r.CumulativeVariance))
	}
	// 单 ticker 标准化后方差为 1，累计方差应为 1
	if math.Abs(r.CumulativeVariance[0]-1.0) > 1e-6 {
		t.Errorf("单 ticker 累计方差应为 1, got %v", r.CumulativeVariance[0])
	}
	if len(r.Loadings) != 1 {
		t.Errorf("应有 1 行 loadings, got %d", len(r.Loadings))
	}
}

func TestPerformPCA_PerfectlyCorrelated(t *testing.T) {
	// 两个完全正相关的 ticker（价格序列完全一致）
	// 标准化后协方差矩阵 = [[1,1],[1,1]], 特征值 = [2, 0]
	// 第一主成分应解释 100% 方差
	prices := map[string]float64{
		"2024-01-01": 100,
		"2024-01-02": 110,
		"2024-01-03": 121,
		"2024-01-04": 133.1,
		"2024-01-05": 120,
	}
	req := PCARequest{
		Tickers: []string{"A", "B"},
		PriceData: map[string]map[string]float64{
			"A": prices,
			"B": prices,
		},
	}
	r, err := PerformPCA(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}

	t.Run("特征值降序排列", func(t *testing.T) {
		for i := 1; i < len(r.Eigenvalues); i++ {
			if r.Eigenvalues[i] > r.Eigenvalues[i-1] {
				t.Errorf("特征值应降序: idx %d=%v > idx %d=%v", i, r.Eigenvalues[i], i-1, r.Eigenvalues[i-1])
			}
		}
	})

	t.Run("第一主成分解释全部方差", func(t *testing.T) {
		if math.Abs(r.CumulativeVariance[0]-1.0) > 1e-6 {
			t.Errorf("完全相关时第一主成分应解释 100%% 方差, got %v", r.CumulativeVariance[0])
		}
	})

	t.Run("第二个特征值接近0", func(t *testing.T) {
		if len(r.Eigenvalues) >= 2 && math.Abs(r.Eigenvalues[1]) > 1e-9 {
			t.Errorf("完全相关时第二个特征值应接近 0, got %v", r.Eigenvalues[1])
		}
	})
}

func TestPerformPCA_NumComponentsTruncation(t *testing.T) {
	pricesA := map[string]float64{
		"2024-01-01": 100, "2024-01-02": 110, "2024-01-03": 105,
		"2024-01-04": 115, "2024-01-05": 108, "2024-01-06": 120,
	}
	pricesB := map[string]float64{
		"2024-01-01": 50, "2024-01-02": 52, "2024-01-03": 49,
		"2024-01-04": 55, "2024-01-05": 51, "2024-01-06": 58,
	}
	pricesC := map[string]float64{
		"2024-01-01": 200, "2024-01-02": 195, "2024-01-03": 210,
		"2024-01-04": 205, "2024-01-05": 220, "2024-01-06": 215,
	}
	numComponents := 2
	req := PCARequest{
		Tickers: []string{"A", "B", "C"},
		PriceData: map[string]map[string]float64{
			"A": pricesA, "B": pricesB, "C": pricesC,
		},
		NumComponents: &numComponents,
	}
	r, err := PerformPCA(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.Eigenvalues) != 2 {
		t.Errorf("NumComponents=2 时应保留 2 个特征值, got %d", len(r.Eigenvalues))
	}
	if len(r.CumulativeVariance) != 2 {
		t.Errorf("应保留 2 个累计方差, got %d", len(r.CumulativeVariance))
	}
	// Loadings 每行应保留 keep 列
	for i, row := range r.Loadings {
		if len(row) != 2 {
			t.Errorf("loadings 行 %d 应有 2 列, got %d", i, len(row))
		}
	}
}

func TestPerformPCA_ScoresLength(t *testing.T) {
	pricesA := map[string]float64{
		"2024-01-01": 100, "2024-01-02": 110, "2024-01-03": 105, "2024-01-04": 115,
	}
	pricesB := map[string]float64{
		"2024-01-01": 50, "2024-01-02": 52, "2024-01-03": 49, "2024-01-04": 55,
	}
	req := PCARequest{
		Tickers: []string{"A", "B"},
		PriceData: map[string]map[string]float64{
			"A": pricesA, "B": pricesB,
		},
	}
	r, err := PerformPCA(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	// nDates=4, nReturns=3
	if len(r.Scores) != 3 {
		t.Errorf("Scores 应有 3 行(收益率数), got %d", len(r.Scores))
	}
	for i, row := range r.Scores {
		if len(row) != 2 {
			t.Errorf("Scores 行 %d 应有 2 列(ticker数), got %d", i, len(row))
		}
	}
	// Tickers 应原样返回
	if len(r.Tickers) != 2 || r.Tickers[0] != "A" || r.Tickers[1] != "B" {
		t.Errorf("Tickers 应原样返回, got %v", r.Tickers)
	}
}
