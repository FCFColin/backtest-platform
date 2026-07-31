package letf
import (
    "math"
    "testing"
)
func TestToPricePoints(t *testing.T) {
t.Run("空map返回nil", func(t *testing.T) { r := ToPricePoints(map[string]float64{}); if r != nil { t.Errorf("空 map 应返回 nil, got %v", r) } })
	t.Run("过滤NaN和零价格", func(t *testing.T) {
data := map[string]float64{ "2024-01-03": 130, "2024-01-01": math.NaN(), "2024-01-02": 0, "2024-01-04": -10, "2024-01-05": 140 }
		r := ToPricePoints(data)
if len(r) != 2 { t.Fatalf("应只保留 2 个有效点, got %d", len(r)) }
if r[0].Date != "2024-01-03" || r[1].Date != "2024-01-05" { t.Errorf("应按日期升序, got %v -> %v", r[0].Date, r[1].Date) }
if r[0].Price != 130 || r[1].Price != 140 { t.Errorf("价格不正确: %v, %v", r[0].Price, r[1].Price) }
	})
	t.Run("按日期升序排列", func(t *testing.T) {
		data := map[string]float64{ "2024-03-01": 100, "2024-01-01": 90, "2024-02-01": 95, }
		r := ToPricePoints(data)
if len(r) != 3 { t.Fatalf("应有 3 个点, got %d", len(r)) }
		expected := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
		for i, want := range expected {
if r[i].Date != want { t.Errorf("点 %d 日期 %v, want %v", i, r[i].Date, want) }
		}
	})
}
func TestAnalyzeSlippage_InsufficientData(t *testing.T) {
	t.Run("空序列返回错误", func(t *testing.T) {
		req := LETFRequest{ LETFSeries:  []PricePoint{}, BenchSeries: []PricePoint{}, Leverage:    2, }
		r, err := AnalyzeSlippage(req)
if err == nil { t.Errorf("应返回错误, got %+v", r) }
if r != nil { t.Errorf("错误时应返回 nil, got %+v", r) }
	})
	t.Run("仅1个交易日返回错误", func(t *testing.T) {
req := LETFRequest{ LETFSeries: []PricePoint{{Date: "2024-01-01", Price: 100}}, BenchSeries: []PricePoint{{Date: "2024-01-01", Price: 100}}, Leverage: 2 }
if _, err := AnalyzeSlippage(req); err == nil { t.Errorf("至少需要 2 个交易日, 应返回错误") }
	})
	t.Run("日期不匹配返回错误", func(t *testing.T) {
		req := LETFRequest{
			LETFSeries:  []PricePoint{{Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 110}},
			BenchSeries: []PricePoint{{Date: "2024-02-01", Price: 100}, {Date: "2024-02-02", Price: 110}},
			Leverage:    2,
		}
if _, err := AnalyzeSlippage(req); err == nil { t.Errorf("无对齐日期应返回错误") }
	})
}
func TestAnalyzeSlippage_NoSlippage(t *testing.T) {
	req := LETFRequest{
		LETFSeries: []PricePoint{
			{Date: "2024-01-01", Price: 100},
			{Date: "2024-01-02", Price: 120}, // +20% = 2x benchmark +10%
		},
		BenchSeries: []PricePoint{ {Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 110}, },
		Leverage: 2,
	}
	r, err := AnalyzeSlippage(req)
if err != nil { t.Fatalf("不应报错: %v", err) }
t.Run("滑点为零", func(t *testing.T) { if math.Abs(r.Stats.Slippage) > 1e-9 { t.Errorf("完美跟踪时滑点应为 0, got %v", r.Stats.Slippage) } })
t.Run("基准收益10%", func(t *testing.T) { if math.Abs(r.Stats.BenchmarkReturn-0.1) > 1e-9 { t.Errorf("BenchmarkReturn 应为 0.1, got %v", r.Stats.BenchmarkReturn) } })
t.Run("LETF收益20%", func(t *testing.T) { if math.Abs(r.Stats.LETFReturn-0.2) > 1e-9 { t.Errorf("LETFReturn 应为 0.2, got %v", r.Stats.LETFReturn) } })
t.Run("期望收益20%", func(t *testing.T) { if math.Abs(r.Stats.ExpectedReturn-0.2) > 1e-9 { t.Errorf("ExpectedReturn 应为 0.2, got %v", r.Stats.ExpectedReturn) } })
	t.Run("滑点曲线最后一点为零", func(t *testing.T) {
if len(r.SlippageCurve) != 1 { t.Fatalf("应有 1 个滑点, got %d", len(r.SlippageCurve)) }
if math.Abs(r.SlippageCurve[0].Slippage) > 1e-9 { t.Errorf("最后滑点应为 0, got %v", r.SlippageCurve[0].Slippage) }
	})
}
func TestAnalyzeSlippage_WithSlippage(t *testing.T) {
	req := LETFRequest{
		LETFSeries: []PricePoint{ {Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 115}, },
		BenchSeries: []PricePoint{ {Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 110}, },
		Leverage: 2,
	}
	r, err := AnalyzeSlippage(req)
if err != nil { t.Fatalf("不应报错: %v", err) }
t.Run("滑点为5%", func(t *testing.T) { wantSlippage := 0.05; if math.Abs(r.Stats.Slippage-wantSlippage) > 1e-9 { t.Errorf("Slippage 应为 %v, got %v", wantSlippage, r.Stats.Slippage) } })
	t.Run("annualDecay为零_天数不足", func(t *testing.T) { if math.IsNaN(r.AnnualDecay) { t.Errorf("AnnualDecay 不应为 NaN") } })
}
func TestAnalyzeSlippage_EffectiveLeverage(t *testing.T) {
	req := LETFRequest{
LETFSeries: []PricePoint{ {Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 110}, {Date: "2024-01-03", Price: 105} },
BenchSeries: []PricePoint{ {Date: "2024-01-01", Price: 100}, {Date: "2024-01-02", Price: 105}, {Date: "2024-01-03", Price: 102} },
		Leverage: 2,
	}
	r, err := AnalyzeSlippage(req)
if err != nil { t.Fatalf("不应报错: %v", err) }
if len(r.EffectiveLeverage) != 2 { t.Fatalf("EffectiveLeverage 应有 2 个元素, got %d", len(r.EffectiveLeverage)) }
	for i, el := range r.EffectiveLeverage {
if el != nil { t.Errorf("数据量 < 20 时 effectiveLeverage[%d] 应为 nil, got %v", i, *el) }
	}
}
