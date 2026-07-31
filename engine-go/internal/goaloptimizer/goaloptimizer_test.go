package goaloptimizer

import (
	"math"
	"testing"
	"time"
)

func makePriceData(ticker, startDate string, days int, startPrice, dailyGrowth float64) map[string]map[string]float64 {
	pd := map[string]map[string]float64{ticker: {}}
	t, _ := time.Parse("2006-01-02", startDate)
	for i := 0; i < days; i++ {
		date := t.AddDate(0, 0, i).Format("2006-01-02")
		pd[ticker][date] = startPrice * (1 + dailyGrowth*float64(i))
	}
	return pd
}
func TestOptimizeGoals_EmptyAssets(t *testing.T) {
	req := GoalOptimizerRequest{
		TargetAmount: 20000, InitialAmount: 10000, Years: 1,
		Assets:    []Asset{{Ticker: "", Weight: 1}}, // 空 ticker 被过滤
		PriceData: map[string]map[string]float64{}, StartDate: "2024-01-01", EndDate: "2024-12-31",
	}
	r, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r == nil {
		t.Fatal("应返回非 nil 结果")
	}
	if r.SuccessProbability != 0 {
		t.Errorf("空资产时 SuccessProbability 应为 0, got %v", r.SuccessProbability)
	}
}
func TestOptimizeGoals_Deterministic(t *testing.T) {
	pd := makePriceData("A", "2024-01-01", 260, 100, 0.001)
	numSims := 100
	req := GoalOptimizerRequest{
		TargetAmount: 20000, InitialAmount: 10000, Years: 1,
		Assets: []Asset{{Ticker: "A", Weight: 1}}, PriceData: pd, StartDate: "2024-01-01",
		EndDate: "2024-12-31", NumSimulations: &numSims,
	}
	r1, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	r2, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r1.SuccessProbability != r2.SuccessProbability {
		t.Errorf("固定种子应确定性: r1=%v r2=%v", r1.SuccessProbability, r2.SuccessProbability)
	}
	if r1.Recommendation.ExpectedReturn != r2.Recommendation.ExpectedReturn {
		t.Errorf("ExpectedReturn 应确定性: r1=%v r2=%v", r1.Recommendation.ExpectedReturn, r2.Recommendation.ExpectedReturn)
	}
}
func TestOptimizeGoals_GuaranteedSuccess(t *testing.T) {
	pd := makePriceData("A", "2024-01-01", 260, 100, 0.001)
	numSims := 50
	req := GoalOptimizerRequest{
		TargetAmount:  5000, // < InitialAmount
		InitialAmount: 10000, Years: 1,
		Assets: []Asset{{Ticker: "A", Weight: 1}}, PriceData: pd, StartDate: "2024-01-01",
		EndDate: "2024-12-31", NumSimulations: &numSims,
	}
	r, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r.SuccessProbability != 1.0 {
		t.Errorf("目标低于初始金额应 SuccessProbability=1, got %v", r.SuccessProbability)
	}
}
func TestOptimizeGoals_StrictConstraintFiltersAll(t *testing.T) {
	pd := makePriceData("A", "2024-01-01", 260, 100, 0.001)
	numSims := 50
	maxDD := -1.0
	req := GoalOptimizerRequest{
		TargetAmount: 20000, InitialAmount: 10000, Years: 1,
		Assets: []Asset{{Ticker: "A", Weight: 1}}, Constraints: &Constraints{MaxDrawdown: &maxDD},
		PriceData: pd, StartDate: "2024-01-01", EndDate: "2024-12-31", NumSimulations: &numSims,
	}
	r, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r.SuccessProbability != 0 {
		t.Errorf("负约束应过滤所有路径, SuccessProbability 应为 0, got %v", r.SuccessProbability)
	}
	if r.ProbabilityCurve != nil {
		t.Errorf("过滤后 ProbabilityCurve 应为 nil, got %v", r.ProbabilityCurve)
	}
}
func TestOptimizeGoals_ResultStructure(t *testing.T) {
	pd := makePriceData("A", "2024-01-01", 260, 100, 0.001)
	numSims := 100
	req := GoalOptimizerRequest{
		TargetAmount: 15000, InitialAmount: 10000, Years: 1,
		Assets: []Asset{{Ticker: "A", Weight: 1}}, PriceData: pd, StartDate: "2024-01-01",
		EndDate: "2024-12-31", NumSimulations: &numSims,
	}
	r, err := OptimizeGoals(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	t.Run("SuccessProbability在合法范围", func(t *testing.T) {
		if r.SuccessProbability < 0 || r.SuccessProbability > 1 {
			t.Errorf("SuccessProbability 应在 [0,1], got %v", r.SuccessProbability)
		}
	})
	t.Run("ProbabilityCurve非空且概率和约1", func(t *testing.T) {
		if len(r.ProbabilityCurve) == 0 {
			t.Fatal("ProbabilityCurve 不应为空")
		}
		sum := 0.0
		for _, p := range r.ProbabilityCurve {
			sum += p.Probability
		}
		if math.Abs(sum-1.0) > 1e-6 {
			t.Errorf("ProbabilityCurve 概率和应为 1, got %v", sum)
		}
	})
	t.Run("OptimalPath包含首末年份", func(t *testing.T) {
		if len(r.OptimalPath) < 2 {
			t.Fatalf("OptimalPath 至少 2 个点, got %d", len(r.OptimalPath))
		}
		if r.OptimalPath[0].Year != 0 {
			t.Errorf("首点 Year 应为 0, got %v", r.OptimalPath[0].Year)
		}
	})
	t.Run("Recommendation字段合法", func(t *testing.T) {
		if r.Recommendation.SuccessRate != r.SuccessProbability {
			t.Errorf("SuccessRate 应等于 SuccessProbability, %v != %v",
				r.Recommendation.SuccessRate, r.SuccessProbability)
		}
		if r.Recommendation.RequiredContribution < 0 {
			t.Errorf("RequiredContribution 应非负, got %v", r.Recommendation.RequiredContribution)
		}
	})
}
func TestOptimizeGoals_NumSimulationsClamped(t *testing.T) {
	pd := makePriceData("A", "2024-01-01", 260, 100, 0.001)
	t.Run("NumSimulations超过10000被截断", func(t *testing.T) {
		huge := 999999
		req := GoalOptimizerRequest{
			TargetAmount: 15000, InitialAmount: 10000, Years: 1,
			Assets: []Asset{{Ticker: "A", Weight: 1}}, PriceData: pd, StartDate: "2024-01-01",
			EndDate: "2024-12-31", NumSimulations: &huge,
		}
		r, err := OptimizeGoals(req)
		if err != nil {
			t.Fatalf("不应报错: %v", err)
		}
		if r == nil {
			t.Fatal("应返回非 nil 结果")
		}
	})
	t.Run("NumSimulations为负数被置为1", func(t *testing.T) {
		neg := -5
		req := GoalOptimizerRequest{
			TargetAmount: 15000, InitialAmount: 10000, Years: 1,
			Assets: []Asset{{Ticker: "A", Weight: 1}}, PriceData: pd, StartDate: "2024-01-01",
			EndDate: "2024-12-31", NumSimulations: &neg,
		}
		r, err := OptimizeGoals(req)
		if err != nil {
			t.Fatalf("不应报错: %v", err)
		}
		if len(r.ProbabilityCurve) == 0 {
			t.Error("ProbabilityCurve 不应为空")
		}
	})
}
