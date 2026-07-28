package tactical

import (
	"context"
	"math"
	"testing"
	"time"
)

// makeDates 生成连续日期序列。
func makeDates(startDate string, n int) []string {
	t, _ := time.Parse("2006-01-02", startDate)
	dates := make([]string, n)
	for i := 0; i < n; i++ {
		dates[i] = t.AddDate(0, 0, i).Format("2006-01-02")
	}
	return dates
}

// makePriceMap 生成 ticker→date→price 的价格数据。
func makePriceMap(ticker string, dates []string, prices []float64) map[string]map[string]float64 {
	pd := map[string]map[string]float64{ticker: {}}
	for i, d := range dates {
		if i < len(prices) {
			pd[ticker][d] = prices[i]
		}
	}
	return pd
}

// trendPrices30 生成 30 天先降后升的价格序列。
func trendPrices30() []float64 {
	down := []float64{110, 108, 106, 104, 102, 100, 98, 96, 94, 92}
	up := []float64{94, 96, 98, 100, 102, 104, 106, 108, 110, 112}
	more := []float64{114, 116, 118, 120, 122, 124, 126, 128, 130, 132}
	return append(append(down, up...), more...)
}

func TestRunTacticalBacktest_EmptyDates(t *testing.T) {
	req := TacticalBacktestRequest{
		Strategy:           TacticalStrategy{ID: "s1", Name: "empty"},
		PriceData:          map[string]map[string]float64{},
		Dates:              []string{},
		StartingValue:      10000,
		RebalanceFrequency: "daily",
	}
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r == nil {
		t.Fatal("应返回非 nil 结果")
	}
	if len(r.Portfolio.GrowthCurve) != 0 {
		t.Errorf("空 dates 应无 GrowthCurve, got %d", len(r.Portfolio.GrowthCurve))
	}
	if len(r.SignalHistory) != 0 {
		t.Errorf("空 dates 应无 SignalHistory, got %d", len(r.SignalHistory))
	}
}

func TestRunTacticalBacktest_NoSignals(t *testing.T) {
	dates := makeDates("2024-01-01", 30)
	prices := trendPrices30()
	req := TacticalBacktestRequest{
		Strategy: TacticalStrategy{
			ID:                "s1",
			Name:              "no-signals",
			Signals:           []TradingSignal{},
			AggregationMethod: "weighted_average",
		},
		PriceData:          makePriceMap("A", dates, prices),
		Dates:              dates,
		StartingValue:      10000,
		RebalanceFrequency: "daily",
	}
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}

	t.Run("GrowthCurve长度与dates一致", func(t *testing.T) {
		if len(r.Portfolio.GrowthCurve) != len(dates) {
			t.Errorf("GrowthCurve 长度=%d, want %d", len(r.Portfolio.GrowthCurve), len(dates))
		}
	})

	t.Run("首点为初始值", func(t *testing.T) {
		if len(r.Portfolio.GrowthCurve) > 0 {
			if math.Abs(r.Portfolio.GrowthCurve[0].Value-10000) > 1e-6 {
				t.Errorf("首点应为初始值 10000, got %v", r.Portfolio.GrowthCurve[0].Value)
			}
		}
	})

	t.Run("无信号时等权重_有SignalHistory", func(t *testing.T) {
		// daily 再平衡应产生 SignalHistory 条目
		if len(r.SignalHistory) == 0 {
			t.Error("daily 再平衡应产生 SignalHistory 条目")
		}
	})
}

func TestRunTacticalBacktest_WithSignal(t *testing.T) {
	dates := makeDates("2024-01-01", 30)
	prices := trendPrices30()
	req := TacticalBacktestRequest{
		Strategy: TacticalStrategy{
			ID:   "s1",
			Name: "sma-cross",
			Signals: []TradingSignal{
				{
					ID:   "sig1",
					Name: "SMA交叉",
					Conditions: []SignalCondition{
						{Indicator: IndSMA, Period: 5, Operator: "cross_above", Threshold: 0},
					},
					TargetWeights: []WeightEntry{
						{Ticker: "A", Weight: 100},
					},
				},
			},
			AggregationMethod: "weighted_average",
		},
		PriceData:          makePriceMap("A", dates, prices),
		Dates:              dates,
		StartingValue:      10000,
		RebalanceFrequency: "daily",
	}
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}

	t.Run("GrowthCurve非空", func(t *testing.T) {
		if len(r.Portfolio.GrowthCurve) != len(dates) {
			t.Errorf("GrowthCurve 长度=%d, want %d", len(r.Portfolio.GrowthCurve), len(dates))
		}
	})

	t.Run("SignalHistory条目结构合法", func(t *testing.T) {
		for i, h := range r.SignalHistory {
			if h.Date == "" {
				t.Errorf("SignalHistory[%d] 日期为空", i)
			}
			// 权重和应接近 1
			sum := 0.0
			for _, w := range h.Weights {
				sum += w.Weight
			}
			if math.Abs(sum-1.0) > 0.01 {
				t.Errorf("SignalHistory[%d] 权重和=%v, want≈1", i, sum)
			}
		}
	})
}

func TestRunGridSearch_Basic(t *testing.T) {
	dates := makeDates("2024-01-01", 30)
	prices := trendPrices30()
	req := TacticalGridRequest{
		Indicator: "sma",
		Param1:    ParamRange{Min: 5, Max: 10, Step: 5},
		Param2:    ParamRange{Min: 0, Max: 5, Step: 5},
		PriceData: makePriceMap("A", dates, prices),
		Dates:     dates,
		Prices:    prices,
		TradingTicker: "A",
		StartDate:      dates[0],
		EndDate:        dates[len(dates)-1],
		StartingValue:  10000,
		RebalanceFrequency: "daily",
		Objective:      "maxCAGR",
	}
	r, err := RunGridSearch(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}

	t.Run("组合数正确", func(t *testing.T) {
		// param1: [5, 10], param2: [0, 5] → 2x2 = 4
		if r.TotalCombinations != 4 {
			t.Errorf("TotalCombinations=%d, want 4", r.TotalCombinations)
		}
		if len(r.AllMetrics) != 4 {
			t.Errorf("AllMetrics 长度=%d, want 4", len(r.AllMetrics))
		}
	})

	t.Run("Heatmap结构正确", func(t *testing.T) {
		if len(r.Heatmap.Param1Values) != 2 {
			t.Errorf("Param1Values 长度=%d, want 2", len(r.Heatmap.Param1Values))
		}
		if len(r.Heatmap.Param2Values) != 2 {
			t.Errorf("Param2Values 长度=%d, want 2", len(r.Heatmap.Param2Values))
		}
		// matrix 应为 2x2
		if len(r.Heatmap.Matrix) != 2 {
			t.Fatalf("Matrix 行数=%d, want 2", len(r.Heatmap.Matrix))
		}
		for i, row := range r.Heatmap.Matrix {
			if len(row) != 2 {
				t.Errorf("Matrix[%d] 列数=%d, want 2", i, len(row))
			}
		}
	})

	t.Run("BestCombination非空", func(t *testing.T) {
		if r.BestCombination == nil {
			t.Error("BestCombination 不应为 nil")
		}
	})

	t.Run("默认TopN为10不超过总数", func(t *testing.T) {
		if len(r.TopResults) > 4 {
			t.Errorf("TopResults 长度=%d, 应 <= 4", len(r.TopResults))
		}
		if len(r.TopResults) > r.TotalCombinations {
			t.Errorf("TopResults(%d) 不应超过 TotalCombinations(%d)", len(r.TopResults), r.TotalCombinations)
		}
	})
}

func TestRunGridSearch_TopN(t *testing.T) {
	dates := makeDates("2024-01-01", 30)
	prices := trendPrices30()
	topN := 2
	req := TacticalGridRequest{
		Indicator: "sma",
		Param1:    ParamRange{Min: 5, Max: 10, Step: 5},
		Param2:    ParamRange{Min: 0, Max: 5, Step: 5},
		PriceData: makePriceMap("A", dates, prices),
		Dates:     dates,
		Prices:    prices,
		TradingTicker: "A",
		StartDate:      dates[0],
		EndDate:        dates[len(dates)-1],
		StartingValue:  10000,
		RebalanceFrequency: "daily",
		Objective:      "maxSharpe",
		TopN:           &topN,
	}
	r, err := RunGridSearch(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.TopResults) != 2 {
		t.Errorf("TopN=2 时 TopResults 长度=%d, want 2", len(r.TopResults))
	}
	// 验证 TopResults 按目标值单调排列（不增或不减）
	for i := 1; i < len(r.TopResults); i++ {
		v0 := getObjectiveValue(r.TopResults[i-1].GridCombinationMetrics, req.Objective)
		v1 := getObjectiveValue(r.TopResults[i].GridCombinationMetrics, req.Objective)
		if v0 != v1 {
			// 单调即可, 不假设方向
			ascending := v0 < v1
			for j := i + 1; j < len(r.TopResults); j++ {
				vPrev := getObjectiveValue(r.TopResults[j-1].GridCombinationMetrics, req.Objective)
				vCurr := getObjectiveValue(r.TopResults[j].GridCombinationMetrics, req.Objective)
				if vPrev != vCurr && (vPrev < vCurr) != ascending {
					t.Errorf("TopResults 目标值非单调: idx %d→%d 方向变化", j-1, j)
				}
			}
			break
		}
	}
}

func TestGenerateRange(t *testing.T) {
	t.Run("正常范围", func(t *testing.T) {
		r := generateRange(1, 5, 1)
		if len(r) != 5 {
			t.Errorf("应生成 5 个值, got %d", len(r))
		}
		if r[0] != 1 || r[4] != 5 {
			t.Errorf("范围应为 [1,5], got [%v, %v]", r[0], r[4])
		}
	})

	t.Run("step<=0返回单元素", func(t *testing.T) {
		r := generateRange(1, 5, 0)
		if len(r) != 1 {
			t.Errorf("step=0 应返回单元素, got %d", len(r))
		}
		if r[0] != 1 {
			t.Errorf("应返回 min=1, got %v", r[0])
		}
	})

	t.Run("浮点步长", func(t *testing.T) {
		r := generateRange(0, 1, 0.5)
		if len(r) != 3 {
			t.Errorf("应生成 3 个值 [0, 0.5, 1], got %d: %v", len(r), r)
		}
	})
}

func TestGetObjectiveValue(t *testing.T) {
	m := GridCombinationMetrics{CAGR: 0.1, MaxDrawdown: 0.2, Sharpe: 1.5}
	tests := []struct {
		name      string
		objective string
		want      float64
	}{
		{"maxCAGR", "maxCAGR", 0.1},
		{"minDrawdown取负", "minDrawdown", -0.2},
		{"maxSharpe", "maxSharpe", 1.5},
		{"未知目标默认CAGR", "unknown", 0.1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := getObjectiveValue(m, tc.objective); got != tc.want {
				t.Errorf("getObjectiveValue(%v) = %v, want %v", tc.objective, got, tc.want)
			}
		})
	}
}
