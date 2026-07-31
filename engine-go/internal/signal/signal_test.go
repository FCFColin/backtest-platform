package signal

import (
	"context"
	"engine-go/internal/enginetest"
	"math"
	"testing"
)

func trendPrices() []float64 {
	up := []float64{100, 102, 104, 106, 108, 110, 112, 114, 116, 118}
	down := []float64{118, 116, 114, 112, 110, 108, 106, 104, 102, 100}
	return append(append(up, down...), up...)
}
func TestToPricePoints(t *testing.T) {
	t.Run("空map返回nil", func(t *testing.T) {
		if r := ToPricePoints(map[string]float64{}); r != nil {
			t.Errorf("空 map 应返回 nil, got %v", r)
		}
	})
	t.Run("过滤NaN和零负价格", func(t *testing.T) {
		data := map[string]float64{"2024-01-03": 130, "2024-01-01": math.NaN(), "2024-01-02": 0, "2024-01-04": -10, "2024-01-05": 140}
		r := ToPricePoints(data)
		if len(r) != 2 {
			t.Fatalf("应只保留 2 个有效点, got %d", len(r))
		}
		if r[0].Date != "2024-01-03" || r[1].Date != "2024-01-05" {
			t.Errorf("应按日期升序, got %v, %v", r[0].Date, r[1].Date)
		}
	})
	t.Run("按日期升序排列", func(t *testing.T) {
		data := map[string]float64{"2024-03-01": 100, "2024-01-01": 90, "2024-02-01": 95}
		r := ToPricePoints(data)
		if len(r) != 3 {
			t.Fatalf("应有 3 个点, got %d", len(r))
		}
		expected := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
		for i, want := range expected {
			if r[i].Date != want {
				t.Errorf("点 %d 日期 %v, want %v", i, r[i].Date, want)
			}
		}
	})
}
func TestAnalyzeSignal_EmptyData(t *testing.T) {
	t.Run("空数据无信号", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5}
		r := AnalyzeSignal(req, []PricePoint{})
		if len(r.Signals) != 0 {
			t.Errorf("空数据应无信号, got %d", len(r.Signals))
		}
		if r.Statistics.TotalSignals != 0 {
			t.Errorf("TotalSignals 应为 0, got %v", r.Statistics.TotalSignals)
		}
	})
	t.Run("单点数据无信号", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5}
		r := AnalyzeSignal(req, []PricePoint{{Date: "2024-01-01", Price: 100}})
		if len(r.Signals) != 0 {
			t.Errorf("单点数据应无信号, got %d", len(r.Signals))
		}
	})
}
func TestAnalyzeSignal_SMA(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: ""}
	r := AnalyzeSignal(req, data)
	t.Run("产生信号", func(t *testing.T) {
		if len(r.Signals) == 0 {
			t.Error("趋势数据应产生 SMA 交叉信号")
		}
	})
	t.Run("信号含买卖方向", func(t *testing.T) {
		hasBuy, hasSell := false, false
		for _, s := range r.Signals {
			if s.Type == SignalBuy {
				hasBuy = true
			}
			if s.Type == SignalSell {
				hasSell = true
			}
		}
		if !hasBuy {
			t.Error("应包含买入信号")
		}
		if !hasSell {
			t.Error("应包含卖出信号")
		}
	})
	t.Run("Statistics结构正确", func(t *testing.T) {
		if r.Statistics.TotalSignals != len(r.Signals) {
			t.Errorf("TotalSignals=%v, want %v", r.Statistics.TotalSignals, len(r.Signals))
		}
		if r.Statistics.WinRate < 0 || r.Statistics.WinRate > 1 {
			t.Errorf("WinRate 应在 [0,1], got %v", r.Statistics.WinRate)
		}
	})
	t.Run("EquityCurve长度与数据一致", func(t *testing.T) {
		if len(r.EquityCurve) != len(data) {
			t.Errorf("EquityCurve 长度=%v, want %v", len(r.EquityCurve), len(data))
		}
		if len(r.EquityCurve) > 0 {
			if r.EquityCurve[0].Value != 10000 {
				t.Errorf("首点权益应为初始资金 10000, got %v", r.EquityCurve[0].Value)
			}
		}
	})
}
func TestAnalyzeSignal_FilterByType(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	t.Run("entry只保留买入", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: "entry"}
		r := AnalyzeSignal(req, data)
		for _, s := range r.Signals {
			if s.Type != SignalBuy {
				t.Errorf("entry 应只含买入信号, got %v", s.Type)
			}
		}
	})
	t.Run("exit只保留卖出", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: "exit"}
		r := AnalyzeSignal(req, data)
		for _, s := range r.Signals {
			if s.Type != SignalSell {
				t.Errorf("exit 应只含卖出信号, got %v", s.Type)
			}
		}
	})
}
func TestAnalyzeSignal_PeriodTooSmall(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	req := SignalAnalysisRequest{Indicator: "sma", Period: 1}
	r := AnalyzeSignal(req, data)
	if r.Statistics.TotalSignals < 0 {
		t.Errorf("TotalSignals 不应为负: %v", r.Statistics.TotalSignals)
	}
}
func TestAnalyzeSignal_UnknownIndicator(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	req := SignalAnalysisRequest{Indicator: "unknown_indicator", Period: 5}
	r := AnalyzeSignal(req, data)
	if len(r.Signals) != 0 {
		t.Errorf("未知指标应无信号, got %d", len(r.Signals))
	}
}
func TestAnalyzeDualSignal(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	cfg1 := SignalAnalysisRequest{Indicator: "sma", Period: 5}
	cfg2 := SignalAnalysisRequest{Indicator: "ema", Period: 5}
	t.Run("and组合", func(t *testing.T) {
		r := AnalyzeDualSignal(cfg1, cfg2, data, data, "and")
		s1Count := len(r.Signal1.Signals)
		s2Count := len(r.Signal2.Signals)
		combinedCount := len(r.Combined.Signals)
		if combinedCount > s1Count || combinedCount > s2Count {
			t.Errorf("and 组合信号数(%d) 应 <= 单信号数(%d, %d)", combinedCount, s1Count, s2Count)
		}
		if len(r.Comparison) == 0 {
			t.Error("Comparison 不应为空")
		}
	})
	t.Run("or组合", func(t *testing.T) {
		r := AnalyzeDualSignal(cfg1, cfg2, data, data, "or")
		s1Count := len(r.Signal1.Signals)
		combinedCount := len(r.Combined.Signals)
		if combinedCount < s1Count {
			t.Errorf("or 组合信号数(%d) 应 >= 单信号1数(%d)", combinedCount, s1Count)
		}
	})
	t.Run("xor组合", func(t *testing.T) {
		r := AnalyzeDualSignal(cfg1, cfg2, data, data, "xor")
		if r.Signal1.Signals == nil && r.Signal2.Signals == nil {
		}
	})
}
func TestAnalyzeMultiSignal(t *testing.T) {
	data := ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))
	configs := []SignalAnalysisRequest{{Indicator: "sma", Period: 5}, {Indicator: "ema", Period: 5}, {Indicator: "rsi", Period: 5}}
	t.Run("weighted聚合", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), configs, data, "weighted", []float64{0.5, 0.3, 0.2})
		if len(r.Contributions) != len(configs) {
			t.Errorf("Contributions 数应 = 配置数, got %d want %d", len(r.Contributions), len(configs))
		}
		for i, c := range r.Contributions {
			if c.Index != i {
				t.Errorf("Contribution[%d].Index=%v, want %d", i, c.Index, i)
			}
		}
	})
	t.Run("voting聚合", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), configs, data, "voting", nil)
		if len(r.Contributions) != len(configs) {
			t.Errorf("Contributions 数应 = 配置数, got %d", len(r.Contributions))
		}
	})
	t.Run("rank聚合_默认", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), configs, data, "rank", nil)
		if len(r.Contributions) != len(configs) {
			t.Errorf("Contributions 数应 = 配置数, got %d", len(r.Contributions))
		}
	})
	t.Run("空配置不panic", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), []SignalAnalysisRequest{}, data, "rank", nil)
		if len(r.Contributions) != 0 {
			t.Errorf("空配置应无 Contributions, got %d", len(r.Contributions))
		}
	})
}
