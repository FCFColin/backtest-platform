package engine

import (
	"math"
	"testing"
)

func TestCalcCAGR(t *testing.T) {
	tests := []struct {
		name       string
		startValue float64
		endValue   float64
		years      float64
		want       float64
	}{
		{"doubles in 1 year", 100, 200, 1, 1.0},
		{"no growth", 100, 100, 1, 0},
		{"10% for 5 years", 100, 161.051, 5, 0.1},
		{"zero start", 0, 100, 1, 0},
		{"zero end", 100, 0, 1, 0},
		{"negative years", 100, 200, -1, 0},
		{"small values", 0.001, 0.002, 1, 1.0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcCAGR(tt.startValue, tt.endValue, tt.years)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcCAGR() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcMWRR(t *testing.T) {
	tests := []struct {
		name      string
		cashflows []struct {
			Value float64
			Time  float64
		}
		want float64
	}{
		{"no cashflows", nil, 0},
		{"invest 100 receive 120 in 1yr",
			[]struct {
				Value float64
				Time  float64
			}{{-100, 0}, {120, 1}},
			0.2,
		},
		{"invest 100 receive 110 in 1yr",
			[]struct {
				Value float64
				Time  float64
			}{{-100, 0}, {110, 1}},
			0.1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcMWRR(tt.cashflows)
			if math.Abs(got-tt.want) > 1e-6 {
				t.Errorf("CalcMWRR() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcAnnualizedStdev(t *testing.T) {
	tests := []struct {
		name         string
		dailyReturns []float64
		want         float64
	}{
		{"empty", nil, 0},
		{"single return", []float64{0.01}, 0},
		{"two returns symmetric", []float64{0.01, -0.01}, math.Sqrt(0.0002) * math.Sqrt(252)},
		{"all zeros", []float64{0, 0, 0}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcAnnualizedStdev(tt.dailyReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcAnnualizedStdev() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcSharpe(t *testing.T) {
	tests := []struct {
		name   string
		cagr   float64
		stdev  float64
		want   float64
	}{
		{"zero stdev", 0.10, 0, 0},
		{"positive", 0.10, 0.15, (0.10 - 0.02) / 0.15},
		{"negative cagr", -0.05, 0.20, (-0.05 - 0.02) / 0.20},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcSharpe(tt.cagr, tt.stdev)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcSharpe() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcSortino(t *testing.T) {
	t.Run("insufficient data", func(t *testing.T) {
		if got := CalcSortino(0.10, []float64{0.01}); got != 0 {
			t.Errorf("CalcSortino() = %v, want 0", got)
		}
	})

	t.Run("no downside returns above daily risk free", func(t *testing.T) {
		if got := CalcSortino(0.10, []float64{0.01, 0.02, 0.03}); got != 0 {
			t.Errorf("CalcSortino() = %v, want 0", got)
		}
	})

	t.Run("all downside returns negative", func(t *testing.T) {
		got := CalcSortino(0.10, []float64{-0.01, -0.02})
		if got == 0 {
			t.Error("CalcSortino() = 0, expected non-zero for negative returns")
		}
	})
}

func TestCalcMaxDrawdown(t *testing.T) {
	tests := []struct {
		name          string
		values        []float64
		wantDrawdown  float64
		wantDuration  int
	}{
		{"insufficient data", []float64{100}, 0, 0},
		{"monotonic up", []float64{100, 110, 120, 130}, 0, 0},
		{"monotonic down", []float64{100, 90, 80, 70}, 0.3, 3},
		{"peak recovery", []float64{100, 110, 90, 80, 110}, (110.0 - 80.0) / 110.0, 2},
		{"two peaks higher recovery", []float64{100, 110, 105, 115, 105, 95}, (115.0 - 95.0) / 115.0, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcMaxDrawdown(tt.values)
			if math.Abs(got.MaxDrawdown-tt.wantDrawdown) > 1e-10 {
				t.Errorf("CalcMaxDrawdown().MaxDrawdown = %v, want %v", got.MaxDrawdown, tt.wantDrawdown)
			}
			if got.MaxDrawdownDuration != tt.wantDuration {
				t.Errorf("CalcMaxDrawdown().MaxDrawdownDuration = %v, want %v", got.MaxDrawdownDuration, tt.wantDuration)
			}
		})
	}
}

func TestCalcCorrelation(t *testing.T) {
	tests := []struct {
		name   string
		a, b   []float64
		want   float64
	}{
		{"insufficient data", []float64{1}, []float64{2}, 0},
		{"perfect correlation", []float64{1, 2, 3}, []float64{2, 4, 6}, 1},
		{"inverse correlation", []float64{1, 2, 3}, []float64{3, 2, 1}, -1},
		{"no correlation (constant)", []float64{1, 2, 3}, []float64{1, 1, 1}, 0},
		{"truncated to shorter", []float64{1, 2, 3, 4}, []float64{2, 4, 6}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcCorrelation(tt.a, tt.b)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcCorrelation() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcDailyReturns(t *testing.T) {
	tests := []struct {
		name   string
		prices []float64
		want   []float64
	}{
		{"insufficient data", []float64{100}, nil},
		{"two prices", []float64{100, 110}, []float64{0.1}},
		{"three prices", []float64{100, 110, 121}, []float64{0.1, 0.1}},
		{"declining", []float64{100, 90, 81}, []float64{-0.1, -0.1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcDailyReturns(tt.prices)
			if len(got) != len(tt.want) {
				t.Fatalf("CalcDailyReturns() len = %v, want %v", len(got), len(tt.want))
			}
			for i := range got {
				if math.Abs(got[i]-tt.want[i]) > 1e-10 {
					t.Errorf("CalcDailyReturns()[%d] = %v, want %v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestCalcTotalReturn(t *testing.T) {
	tests := []struct {
		name       string
		start, end float64
		want       float64
	}{
		{"zero start", 0, 100, 0},
		{"negative start", -100, 200, 0},
		{"100% gain", 100, 200, 1.0},
		{"50% loss", 100, 50, -0.5},
		{"no change", 100, 100, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcTotalReturn(tt.start, tt.end)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcTotalReturn() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMaxValue(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   float64
	}{
		{"empty", nil, 0},
		{"all positive", []float64{0.05, 0.10, 0.15}, 0.15},
		{"mixed", []float64{-0.10, 0.20, -0.05}, 0.20},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MaxValue(tt.values)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("MaxValue() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestMinValue(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   float64
	}{
		{"empty", nil, 0},
		{"mixed", []float64{0.05, -0.10, 0.15}, -0.10},
		{"all negative", []float64{-0.05, -0.10, -0.15}, -0.15},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MinValue(tt.values)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("MinValue() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcAvgDrawdown(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   float64
	}{
		{"insufficient data", []float64{100}, 0},
		{"monotonic up", []float64{100, 110, 120}, 0},
		{"single drawdown", []float64{100, 110, 90, 80}, ((110.0-90.0)/110.0 + (110.0-80.0)/110.0) / 2.0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcAvgDrawdown(tt.values)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcAvgDrawdown() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcUlcerIndex(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   float64
	}{
		{"insufficient data", []float64{100}, 0},
		{"monotonic up", []float64{100, 110, 120}, 0},
		{"monotonic down", []float64{100, 80, 60}, math.Sqrt(((100.0-80.0)*(100.0-80.0)/(100.0*100.0) + (100.0-60.0)*(100.0-60.0)/(100.0*100.0)) / 3.0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcUlcerIndex(tt.values)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcUlcerIndex() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcCalmar(t *testing.T) {
	tests := []struct {
		name        string
		cagr        float64
		maxDrawdown float64
		want        float64
	}{
		{"zero drawdown", 0.10, 0, 0},
		{"normal case", 0.10, 0.20, 0.5},
		{"negative cagr", -0.05, 0.20, -0.25},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcCalmar(tt.cagr, tt.maxDrawdown)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcCalmar() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcUPI(t *testing.T) {
	tests := []struct {
		name       string
		cagr       float64
		ulcerIndex float64
		want       float64
	}{
		{"zero ulcer", 0.10, 0, 0},
		{"normal case", 0.10, 0.15, (0.10 - 0.02) / 0.15},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcUPI(tt.cagr, tt.ulcerIndex)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcUPI() = %v, want %v", got, tt.want)
			}
		})
	}
}
