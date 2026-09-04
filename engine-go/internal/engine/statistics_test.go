package engine

import (
	"engine-go/internal/enginetest"
	"engine-go/internal/mathutil"
	"math"
	"testing"
)

func TestCalcCAGR(t *testing.T) {
	for _, tc := range []struct {
		name                              string
		startValue, endValue, years, want float64
	}{
		{"doubles in 1 year", 100, 200, 1, 1.0},
		{"no growth", 100, 100, 1, 0},
		{"10% for 5 years", 100, 161.051, 5, 0.1},
		{"zero start", 0, 100, 1, 0},
		{"zero end", 100, 0, 1, 0},
		{"negative years", 100, 200, -1, 0},
		{"small values", 0.001, 0.002, 1, 1.0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcCAGR(tc.startValue, tc.endValue, tc.years), tc.want, "CalcCAGR")
		})
	}
}
func TestCalcMWRR(t *testing.T) {
	for _, tc := range []struct {
		name      string
		cashflows []Cashflow
		want      float64
	}{
		{"no cashflows", nil, 0},
		{"invest 100 receive 120 in 1yr", []Cashflow{{-100, 0}, {120, 1}}, 0.2},
		{"invest 100 receive 110 in 1yr", []Cashflow{{-100, 0}, {110, 1}}, 0.1},
		{"only inflows undefined", []Cashflow{{100, 1}}, 0},
		{"only outflows undefined", []Cashflow{{-100, 0}}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := CalcMWRR(tc.cashflows); math.Abs(got-tc.want) > 1e-6 {
				t.Errorf("CalcMWRR() = %v, want %v", got, tc.want)
			}
		})
	}
}
func TestCalcDiversificationRatio(t *testing.T) {
	for _, tc := range []struct {
		name      string
		weights   []float64
		assets    [][]float64
		portfolio []float64
		want      float64
	}{
		{"mismatched lengths", []float64{1}, nil, []float64{0.01, -0.01, 0.02}, 0},
		{"short portfolio", []float64{1}, [][]float64{{0.01}}, []float64{0.01}, 0},
		{"zero portfolio stdev", []float64{1}, [][]float64{{0.01, -0.01}}, []float64{0, 0}, 0},
		{"single asset ratio 1", []float64{1}, [][]float64{{0.01, -0.01, 0.02}}, []float64{0.01, -0.01, 0.02}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcDiversificationRatio(tc.weights, tc.assets, tc.portfolio), tc.want, "CalcDiversificationRatio")
		})
	}
}
func TestMWRRWipeout(t *testing.T) {
	stats := CalculateStatisticsFromRequest(StatisticsRequest{
		Values:        []float64{100, 50, 0},
		Dates:         []string{"2024-01-01", "2024-06-01", "2025-01-01"},
		StartingValue: 100,
	})
	if stats.MWRR != -1 {
		t.Errorf("MWRR on total loss must be -1 (not 0), got %v", stats.MWRR)
	}
}
func TestCalcAnnualizedStdev(t *testing.T) {
	for _, tc := range []struct {
		name         string
		dailyReturns []float64
		want         float64
	}{
		{"empty", nil, 0},
		{"single return", []float64{0.01}, 0},
		{"two returns symmetric", []float64{0.01, -0.01}, math.Sqrt(0.0002) * math.Sqrt(252)},
		{"all zeros", []float64{0, 0, 0}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcAnnualizedStdev(tc.dailyReturns), tc.want, "CalcAnnualizedStdev")
		})
	}
}
func TestCalcRatioFuncs(t *testing.T) {
	for _, tc := range []struct {
		name string
		fn   func(float64, float64) float64
		a, b float64
		want float64
	}{
		{"Sharpe zero stdev", CalcSharpe, 0.10, 0, 0},
		{"Sharpe positive", CalcSharpe, 0.10, 0.15, (0.10 - 0.02) / 0.15},
		{"Sharpe negative cagr", CalcSharpe, -0.05, 0.20, (-0.05 - 0.02) / 0.20},
		{"Calmar zero drawdown", CalcCalmar, 0.10, 0, 0},
		{"Calmar normal case", CalcCalmar, 0.10, 0.20, 0.5},
		{"Calmar negative cagr", CalcCalmar, -0.05, 0.20, -0.25},
	} {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, tc.fn(tc.a, tc.b), tc.want, "ratio") })
	}
}

// U-2 收尾：CalcUPI 改显式 rf（与 MartinRatio 口径一致）；rf=0.02 时与旧实现数值相同
func TestCalcUPI(t *testing.T) {
	for _, tc := range []struct {
		name               string
		cagr, ulcerIdx, rf float64
		want               float64
	}{
		{"legacy rf 0.02 same as before", 0.10, 0.15, 0.02, (0.10 - 0.02) / 0.15},
		{"zero ulcer", 0.10, 0, 0.02, 0},
		{"explicit non-legacy rf", 0.10, 0.15, 0.05, (0.10 - 0.05) / 0.15},
		{"negative cagr", -0.05, 0.20, 0.02, (-0.05 - 0.02) / 0.20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcUPI(tc.cagr, tc.ulcerIdx, tc.rf), tc.want, "CalcUPI")
		})
	}
}
func TestCalcSortino(t *testing.T) {
	for _, tc := range []struct {
		name     string
		cagr     float64
		returns  []float64
		wantZero bool
	}{
		{"insufficient data", 0.10, []float64{0.01}, true},
		{"no downside returns above daily risk free", 0.10, []float64{0.01, 0.02, 0.03}, true},
		{"all downside returns negative", 0.10, []float64{-0.01, -0.02}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := CalcSortino(tc.cagr, tc.returns)
			if tc.wantZero {
				if got != 0 {
					t.Errorf("CalcSortino() = %v, want 0", got)
				}
			} else {
				if got == 0 {
					t.Error("CalcSortino() = 0, expected non-zero for negative returns")
				}
			}
		})
	}
}
func TestCalcMaxDrawdown(t *testing.T) {
	for _, tc := range []struct {
		name         string
		values       []float64
		wantDrawdown float64
		wantDuration int
	}{
		{"insufficient data", []float64{100}, 0, 0},
		{"monotonic up", []float64{100, 110, 120, 130}, 0, 0},
		{"monotonic down", []float64{100, 90, 80, 70}, 0.3, 3},
		{"peak recovery", []float64{100, 110, 90, 80, 110}, (110.0 - 80.0) / 110.0, 2},
		{"two peaks higher recovery", []float64{100, 110, 105, 115, 105, 95}, (115.0 - 95.0) / 115.0, 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := CalcMaxDrawdown(tc.values)
			if math.Abs(got.MaxDrawdown-tc.wantDrawdown) > 1e-10 {
				t.Errorf("MaxDrawdown = %v, want %v", got.MaxDrawdown, tc.wantDrawdown)
			}
			if got.MaxDrawdownDuration != tc.wantDuration {
				t.Errorf("MaxDrawdownDuration = %v, want %v", got.MaxDrawdownDuration, tc.wantDuration)
			}
		})
	}
}
func TestCalcCorrelation(t *testing.T) {
	for _, tc := range []struct {
		name string
		a, b []float64
		want float64
	}{
		{"insufficient data", []float64{1}, []float64{2}, 0},
		{"perfect correlation", []float64{1, 2, 3}, []float64{2, 4, 6}, 1},
		{"inverse correlation", []float64{1, 2, 3}, []float64{3, 2, 1}, -1},
		{"no correlation (constant)", []float64{1, 2, 3}, []float64{1, 1, 1}, 0},
		{"truncated to shorter", []float64{1, 2, 3, 4}, []float64{2, 4, 6}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, CalcCorrelation(tc.a, tc.b), tc.want, "CalcCorrelation") })
	}
}
func TestCalcDailyReturns(t *testing.T) {
	for _, tc := range []struct {
		name   string
		prices []float64
		want   []float64
	}{
		{"insufficient data", []float64{100}, nil},
		{"two prices", []float64{100, 110}, []float64{0.1}},
		{"three prices", []float64{100, 110, 121}, []float64{0.1, 0.1}},
		{"declining", []float64{100, 90, 81}, []float64{-0.1, -0.1}},
		{"缺失缺口应按无变动", []float64{100, 0, 110}, []float64{0}},
		{"真实清零应记 -100%", []float64{100, 0, 0}, []float64{-1}},
		{"缺口后恢复应正常", []float64{100, 0, 110, 121}, []float64{0, 0.1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := mathutil.DailyReturns(tc.prices)
			if len(got) != len(tc.want) {
				t.Fatalf("len = %v, want %v", len(got), len(tc.want))
			}
			for i := range got {
				assertFloatApprox(t, got[i], tc.want[i], "DailyReturns[i]")
			}
		})
	}
}
func TestCalcDailyReturnsWithZeros(t *testing.T) {
	for _, tc := range []struct {
		name   string
		prices []float64
		want   []float64
	}{
		{"insufficient data", []float64{100}, nil},
		{"regular", []float64{100, 110, 121}, []float64{0.1, 0.1}},
		{"缺失缺口应按无变动", []float64{100, 0, 110}, []float64{0, 0}},
		{"真实清零应记 -100%", []float64{100, 0, 0}, []float64{-1, 0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := mathutil.DailyReturnsWithZeros(tc.prices)
			if len(got) != len(tc.want) {
				t.Fatalf("len = %v, want %v", len(got), len(tc.want))
			}
			for i := range got {
				assertFloatApprox(t, got[i], tc.want[i], "DailyReturnsWithZeros[i]")
			}
		})
	}
}
func TestCalcTotalReturn(t *testing.T) {
	for _, tc := range []struct {
		name       string
		start, end float64
		want       float64
	}{
		{"zero start", 0, 100, 0},
		{"negative start", -100, 200, 0},
		{"100% gain", 100, 200, 1.0},
		{"50% loss", 100, 50, -0.5},
		{"no change", 100, 100, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcTotalReturn(tc.start, tc.end), tc.want, "CalcTotalReturn")
		})
	}
}
func TestMinMaxValue(t *testing.T) {
	for _, tc := range []struct {
		name string
		fn   func([]float64) float64
		vals []float64
		want float64
	}{
		{"MaxValue empty", MaxValue, nil, 0},
		{"MaxValue all positive", MaxValue, []float64{0.05, 0.10, 0.15}, 0.15},
		{"MaxValue mixed", MaxValue, []float64{-0.10, 0.20, -0.05}, 0.20},
		{"MinValue empty", MinValue, nil, 0},
		{"MinValue mixed", MinValue, []float64{0.05, -0.10, 0.15}, -0.10},
		{"MinValue all negative", MinValue, []float64{-0.05, -0.10, -0.15}, -0.15},
	} {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, tc.fn(tc.vals), tc.want, "value") })
	}
}
func TestCalcDrawdownMetrics(t *testing.T) {
	for _, tc := range []struct {
		name string
		fn   func([]float64) float64
		vals []float64
		want float64
	}{
		{"AvgDrawdown insufficient data", CalcAvgDrawdown, []float64{100}, 0},
		{"AvgDrawdown monotonic up", CalcAvgDrawdown, []float64{100, 110, 120}, 0},
		{"AvgDrawdown single drawdown", CalcAvgDrawdown, []float64{100, 110, 90, 80}, ((110.0-90.0)/110.0 + (110.0-80.0)/110.0) / 2.0},
		{"UlcerIndex insufficient data", CalcUlcerIndex, []float64{100}, 0},
		{"UlcerIndex monotonic up", CalcUlcerIndex, []float64{100, 110, 120}, 0},
		{"UlcerIndex monotonic down", CalcUlcerIndex, []float64{100, 80, 60}, math.Sqrt(((100.0-80.0)*(100.0-80.0)/(100.0*100.0) + (100.0-60.0)*(100.0-60.0)/(100.0*100.0)) / 3.0)},
	} {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, tc.fn(tc.vals), tc.want, "metric") })
	}
}
func swrVolatileRequest() StatisticsRequest {
	return StatisticsRequest{Values: []float64{100, 110}, AnnualReturnValues: enginetest.VolatileAnnualReturns(50)}
}
func TestSWRNotEqualToPWR(t *testing.T) {
	stats := CalculateStatisticsFromRequest(swrVolatileRequest())
	if stats.SWR == stats.PWR {
		t.Errorf("SWR (%v) should differ from PWR (%v) for volatile series", stats.SWR, stats.PWR)
	}
	if stats.SWR < 0 {
		t.Errorf("SWR should be non-negative, got %v", stats.SWR)
	}
}
func TestSWRUsesLongestStandardTerm(t *testing.T) {
	stats := CalculateStatisticsFromRequest(swrVolatileRequest())
	if stats.SWR != stats.SWR40Y {
		t.Errorf("SWR (%v) should equal SWR40Y (%v) when >=40 years of data available", stats.SWR, stats.SWR40Y)
	}
	if stats.SWR > stats.SWR30Y {
		t.Errorf("SWR (%v) should be <= SWR30Y (%v) (longer term = more conservative)", stats.SWR, stats.SWR30Y)
	}
}
