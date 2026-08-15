package tactical

import (
	"context"
	"engine-go/internal/enginetest"
	"math"
	"testing"
)

func trendPrices30() []float64 {
	down := []float64{110, 108, 106, 104, 102, 100, 98, 96, 94, 92}
	up := []float64{94, 96, 98, 100, 102, 104, 106, 108, 110, 112}
	more := []float64{114, 116, 118, 120, 122, 124, 126, 128, 130, 132}
	return append(append(down, up...), more...)
}
func setupData() (dates []string, prices []float64, pd map[string]map[string]float64) {
	prices = trendPrices30()
	dates = enginetest.Dates("2024-01-01", len(prices))
	pd = enginetest.SeriesPriceData("A", dates, prices)
	return
}
func baseTacticalReq(strategy TacticalStrategy) TacticalBacktestRequest {
	dates, _, pd := setupData()
	return TacticalBacktestRequest{Strategy: strategy, PriceData: pd, Dates: dates, StartingValue: 10000, RebalanceFrequency: "daily"}
}
func baseGridReq() TacticalGridRequest {
	dates, prices, _ := setupData()
	return TacticalGridRequest{
		Indicator: "sma", Param1: ParamRange{Min: 5, Max: 10, Step: 5},
		Param2: ParamRange{Min: 0, Max: 5, Step: 5},
		Dates: dates, Prices: prices, TradingTicker: "A",
		StartDate: dates[0], EndDate: dates[len(dates)-1], StartingValue: 10000,
		RebalanceFrequency: "daily",
	}
}
func TestRunTacticalBacktest_EmptyDates(t *testing.T) {
	req := TacticalBacktestRequest{Strategy: TacticalStrategy{ID: "s1", Name: "empty"}, PriceData: map[string]map[string]float64{}, Dates: []string{}, StartingValue: 10000, RebalanceFrequency: "daily"}
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r == nil {
		t.Fatal("应返回非 nil 结果")
		return
	}
	if len(r.Portfolio.GrowthCurve) != 0 {
		t.Errorf("空 dates 应无 GrowthCurve, got %d", len(r.Portfolio.GrowthCurve))
	}
	if len(r.SignalHistory) != 0 {
		t.Errorf("空 dates 应无 SignalHistory, got %d", len(r.SignalHistory))
	}
}
func TestRunTacticalBacktest_NoSignals(t *testing.T) {
	req := baseTacticalReq(TacticalStrategy{ID: "s1", Name: "no-signals", Signals: []TradingSignal{}, AggregationMethod: "weighted_average"})
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.Portfolio.GrowthCurve) != len(req.Dates) {
		t.Errorf("GrowthCurve 长度=%d, want %d", len(r.Portfolio.GrowthCurve), len(req.Dates))
	}
	if len(r.Portfolio.GrowthCurve) > 0 && math.Abs(r.Portfolio.GrowthCurve[0].Value-10000) > 1e-6 {
		t.Errorf("首点应为初始值 10000, got %v", r.Portfolio.GrowthCurve[0].Value)
	}
	if len(r.SignalHistory) == 0 {
		t.Error("daily 再平衡应产生 SignalHistory 条目")
	}
}
func TestRunTacticalBacktest_SignalsWithoutTickers(t *testing.T) {
	// 回归：信号存在但 targetWeights 为空曾触发 allTickers[0] 越界 panic
	req := baseTacticalReq(TacticalStrategy{ID: "s1", Name: "no-tickers", Signals: []TradingSignal{{ID: "sig1", Name: "sig1", TargetWeights: []WeightEntry{}}}})
	if _, err := RunTacticalBacktest(context.Background(), req); err == nil {
		t.Error("信号存在但无有效标的应返回 InputError")
	}
}
func TestRunTacticalBacktest_RankClearsUnselected(t *testing.T) {
	dates := enginetest.Dates("2024-01-01", 10)
	pd := map[string]map[string]float64{
		"A": enginetest.PriceMap("2024-01-01", []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}),
		"B": enginetest.PriceMap("2024-01-01", []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}),
	}
	strategy := TacticalStrategy{
		ID: "s1", Name: "rank-top1", AggregationMethod: "rank", RankingConfig: &RankingConfig{Method: "fixed_share", TopN: 1},
		Signals: []TradingSignal{{ID: "sig1", Name: "信号1",
			Conditions:    []SignalCondition{{Indicator: IndSMA, Period: 5, Operator: "gt", Threshold: 0}},
			TargetWeights: []WeightEntry{{Ticker: "A", Weight: 1}, {Ticker: "B", Weight: 1}},
		}},
	}
	req := TacticalBacktestRequest{Strategy: strategy, PriceData: pd, Dates: dates, StartingValue: 10000, RebalanceFrequency: "daily"}
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	for i, g := range r.Portfolio.GrowthCurve {
		if math.Abs(g.Value-10000) > 1e-6 {
			t.Errorf("GrowthCurve[%d]=%v, want 10000（未选中持仓应清零）", i, g.Value)
		}
	}
	if len(r.SignalHistory) == 0 || r.SignalHistory[0].Weights[0].Ticker != "A" {
		t.Errorf("rank topN=1 应选中单一 ticker, got %+v", r.SignalHistory)
	}
}

func TestAggregateSignals_Voting(t *testing.T) {
	// 两个活跃信号各投一票：A 获 2 票、B 获 1 票 → 权重 2/3、1/3
	strategy := TacticalStrategy{
		ID: "s1", Name: "vote", AggregationMethod: "voting",
		Signals: []TradingSignal{
			{ID: "sig1", Name: "看A", TargetWeights: []WeightEntry{{Ticker: "A", Weight: 1}}},
			{ID: "sig2", Name: "看AB", TargetWeights: []WeightEntry{{Ticker: "A", Weight: 1}, {Ticker: "B", Weight: 1}}},
		},
	}
	flags := map[string][]bool{"sig1": {true}, "sig2": {true}}
	got := aggregateSignals(strategy, flags, 0, []string{"A", "B"})
	if len(got) != 2 || math.Abs(got[0].Weight-2.0/3.0) > 1e-6 || math.Abs(got[1].Weight-1.0/3.0) > 1e-6 {
		t.Errorf("voting 权重应为 A=2/3 B=1/3, got %+v", got)
	}
}

func TestRunTacticalBacktest_WithSignal(t *testing.T) {
	req := baseTacticalReq(TacticalStrategy{
		ID: "s1", Name: "sma-cross", Signals: []TradingSignal{{ID: "sig1", Name: "SMA交叉",
			Conditions:    []SignalCondition{{Indicator: IndSMA, Period: 5, Operator: "cross_above", Threshold: 0}},
			TargetWeights: []WeightEntry{{Ticker: "A", Weight: 100}},
		}},
		AggregationMethod: "weighted_average",
	})
	r, err := RunTacticalBacktest(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.Portfolio.GrowthCurve) != len(req.Dates) {
		t.Errorf("GrowthCurve 长度=%d, want %d", len(r.Portfolio.GrowthCurve), len(req.Dates))
	}
	for i, h := range r.SignalHistory {
		if h.Date == "" {
			t.Errorf("SignalHistory[%d] 日期为空", i)
		}
		sum := 0.0
		for _, w := range h.Weights {
			sum += w.Weight
		}
		if math.Abs(sum-1.0) > 0.01 {
			t.Errorf("SignalHistory[%d] 权重和=%v, want≈1", i, sum)
		}
	}
}
func TestRunGridSearch_Basic(t *testing.T) {
	req := baseGridReq()
	req.Objective = "maxCAGR"
	r, err := RunGridSearch(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r.TotalCombinations != 4 || len(r.AllMetrics) != 4 {
		t.Errorf("TotalCombinations=%d, AllMetrics len=%d, want 4/4", r.TotalCombinations, len(r.AllMetrics))
	}
	if len(r.Heatmap.Param1Values) != 2 || len(r.Heatmap.Param2Values) != 2 || len(r.Heatmap.Matrix) != 2 {
		t.Fatalf("Heatmap 结构错误: P1=%d, P2=%d, Matrix=%d", len(r.Heatmap.Param1Values), len(r.Heatmap.Param2Values), len(r.Heatmap.Matrix))
	}
	for i, row := range r.Heatmap.Matrix {
		if len(row) != 2 {
			t.Errorf("Matrix[%d] 列数=%d, want 2", i, len(row))
		}
	}
	if r.BestCombination == nil {
		t.Error("BestCombination 不应为 nil")
	}
	if len(r.TopResults) > 4 || len(r.TopResults) > r.TotalCombinations {
		t.Errorf("TopResults 长度=%d, 应 <= 4 且 <= TotalCombinations(%d)", len(r.TopResults), r.TotalCombinations)
	}
}
func TestRunGridSearch_TopN(t *testing.T) {
	req := baseGridReq()
	topN := 2
	req.Objective = "maxSharpe"
	req.TopN = &topN
	r, err := RunGridSearch(context.Background(), req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.TopResults) != 2 {
		t.Errorf("TopN=2 时 TopResults 长度=%d, want 2", len(r.TopResults))
	}
	for i := 1; i < len(r.TopResults); i++ {
		v0 := getObjectiveValue(r.TopResults[i-1].GridCombinationMetrics, req.Objective)
		v1 := getObjectiveValue(r.TopResults[i].GridCombinationMetrics, req.Objective)
		if v0 == v1 {
			continue
		}
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
func TestGenerateRange(t *testing.T) {
	cases := []struct {
		name                 string
		minVal, maxVal, step float64
		wantLen              int
		wantFirst, wantLast  float64
	}{{"正常范围", 1, 5, 1, 5, 1, 5}, {"step<=0返回单元素", 1, 5, 0, 1, 1, 1}, {"浮点步长", 0, 1, 0.5, 3, 0, 1}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := generateRange(tc.minVal, tc.maxVal, tc.step)
			if len(r) != tc.wantLen {
				t.Errorf("应生成 %d 个值, got %d", tc.wantLen, len(r))
			}
			if len(r) > 0 && (r[0] != tc.wantFirst || r[len(r)-1] != tc.wantLast) {
				t.Errorf("范围应为 [%v,%v], got [%v,%v]", tc.wantFirst, tc.wantLast, r[0], r[len(r)-1])
			}
		})
	}
}
func TestGetObjectiveValue(t *testing.T) {
	m := GridCombinationMetrics{CAGR: 0.1, MaxDrawdown: 0.2, Sharpe: 1.5}
	cases := []struct {
		name      string
		objective string
		want      float64
	}{{"maxCAGR", "maxCAGR", 0.1}, {"minDrawdown取负", "minDrawdown", -0.2}, {"maxSharpe", "maxSharpe", 1.5}, {"未知目标默认CAGR", "unknown", 0.1}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := getObjectiveValue(m, tc.objective); got != tc.want {
				t.Errorf("getObjectiveValue(%v) = %v, want %v", tc.objective, got, tc.want)
			}
		})
	}
}
func TestBuildSyntheticPricesNoLookahead(t *testing.T) {
	dates := []string{"2024-01-02", "2024-01-03", "2024-01-04"}
	prices := []float64{100, 110, 121}
	signals := []bool{false, true, false}
	got := buildSyntheticPrices(dates, prices, signals)
	want := map[string]float64{"2024-01-02": 100, "2024-01-03": 100, "2024-01-04": 110}
	for d, w := range want {
		if g, ok := got[d]; !ok || math.Abs(g-w) > 1e-9 {
			t.Errorf("synthetic[%s] = %v, want %v", d, g, w)
		}
	}
}
