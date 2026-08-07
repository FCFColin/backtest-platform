package signal

import (
	"context"
	"engine-go/internal/enginetest"
	"engine-go/internal/engineutil"
	"testing"
)

func trendPrices() []float64 {
	up := []float64{100, 102, 104, 106, 108, 110, 112, 114, 116, 118}
	down := []float64{118, 116, 114, 112, 110, 108, 106, 104, 102, 100}
	return append(append(up, down...), up...)
}

var trendData = engineutil.ToPricePoints(enginetest.PriceMap("2024-01-01", trendPrices()))

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
	req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: ""}
	r := AnalyzeSignal(req, trendData)
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
		if len(r.EquityCurve) != len(trendData) {
			t.Errorf("EquityCurve 长度=%v, want %v", len(r.EquityCurve), len(trendData))
		}
		if len(r.EquityCurve) > 0 {
			if r.EquityCurve[0].Value != 10000 {
				t.Errorf("首点权益应为初始资金 10000, got %v", r.EquityCurve[0].Value)
			}
		}
	})
}
func TestAnalyzeSignal_FilterByType(t *testing.T) {
	t.Run("entry只保留买入", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: "entry"}
		r := AnalyzeSignal(req, trendData)
		for _, s := range r.Signals {
			if s.Type != SignalBuy {
				t.Errorf("entry 应只含买入信号, got %v", s.Type)
			}
		}
	})
	t.Run("exit只保留卖出", func(t *testing.T) {
		req := SignalAnalysisRequest{Indicator: "sma", Period: 5, SignalType: "exit"}
		r := AnalyzeSignal(req, trendData)
		for _, s := range r.Signals {
			if s.Type != SignalSell {
				t.Errorf("exit 应只含卖出信号, got %v", s.Type)
			}
		}
	})
}
func TestAnalyzeSignal_PeriodTooSmall(t *testing.T) {
	req := SignalAnalysisRequest{Indicator: "sma", Period: 1}
	r := AnalyzeSignal(req, trendData)
	if r.Statistics.TotalSignals < 0 {
		t.Errorf("TotalSignals 不应为负: %v", r.Statistics.TotalSignals)
	}
}
func TestAnalyzeSignal_UnknownIndicator(t *testing.T) {
	req := SignalAnalysisRequest{Indicator: "unknown_indicator", Period: 5}
	r := AnalyzeSignal(req, trendData)
	if len(r.Signals) != 0 {
		t.Errorf("未知指标应无信号, got %d", len(r.Signals))
	}
}
func TestAnalyzeDualSignal(t *testing.T) {
	cfg1 := SignalAnalysisRequest{Indicator: "sma", Period: 5}
	cfg2 := SignalAnalysisRequest{Indicator: "ema", Period: 5}
	t.Run("and组合", func(t *testing.T) {
		r := AnalyzeDualSignal(cfg1, cfg2, trendData, trendData, "and")
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
		r := AnalyzeDualSignal(cfg1, cfg2, trendData, trendData, "or")
		s1Count := len(r.Signal1.Signals)
		combinedCount := len(r.Combined.Signals)
		if combinedCount < s1Count {
			t.Errorf("or 组合信号数(%d) 应 >= 单信号1数(%d)", combinedCount, s1Count)
		}
	})
}
func TestAnalyzeMultiSignal(t *testing.T) {
	configs := []SignalAnalysisRequest{{Indicator: "sma", Period: 5}, {Indicator: "ema", Period: 5}, {Indicator: "rsi", Period: 5}}
	t.Run("weighted聚合", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), configs, trendData, "weighted", []float64{0.5, 0.3, 0.2})
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
		r := AnalyzeMultiSignal(context.Background(), configs, trendData, "voting", nil)
		if len(r.Contributions) != len(configs) {
			t.Errorf("Contributions 数应 = 配置数, got %d", len(r.Contributions))
		}
	})
	t.Run("rank聚合_默认", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), configs, trendData, "rank", nil)
		if len(r.Contributions) != len(configs) {
			t.Errorf("Contributions 数应 = 配置数, got %d", len(r.Contributions))
		}
	})
	t.Run("空配置不panic", func(t *testing.T) {
		r := AnalyzeMultiSignal(context.Background(), []SignalAnalysisRequest{}, trendData, "rank", nil)
		if len(r.Contributions) != 0 {
			t.Errorf("空配置应无 Contributions, got %d", len(r.Contributions))
		}
	})
}
