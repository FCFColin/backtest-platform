package engine

import (
	"math"
	"testing"
)

func assertNoPanic(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panicked: %v", r)
		}
	}()
	fn()
}

func TestCalcVaR_ConfidenceEdgeCases(t *testing.T) {
	returns := []float64{-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04}
	cases := []struct {
		name       string
		confidence float64
	}{
		{"confidence zero", 0},
		{"confidence negative", -0.5},
		{"confidence exactly one", 1.0},
		{"confidence above one", 1.5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertNoPanic(t, func() {
				if got := CalcVaR(returns, c.confidence); got != 0 {
					t.Errorf("CalcVaR(conf=%v) = %v, want 0", c.confidence, got)
				}
			})
		})
	}
}
func TestCalcVaR_ConfidenceSubnormal(t *testing.T) {
	returns := []float64{-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04}
	assertNoPanic(t, func() {
		if got := CalcVaR(returns, 1e-300); math.IsNaN(got) || math.IsInf(got, 0) {
			t.Errorf("CalcVaR(1e-300) = %v, want finite", got)
		}
	})
}
func TestCalcVaR_NilSlice(t *testing.T) {
	assertNoPanic(t, func() {
		if got := CalcVaR(nil, 0.95); got != 0 {
			t.Errorf("CalcVaR(nil, 0.95) = %v, want 0", got)
		}
	})
}
func TestCalcCVaR_ConfidenceEdgeCases(t *testing.T) {
	returns := []float64{-0.06, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.04}
	cases := []struct {
		name       string
		confidence float64
	}{
		{"confidence zero", 0},
		{"confidence negative", -0.5},
		{"confidence exactly one", 1.0},
		{"confidence above one", 1.5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertNoPanic(t, func() {
				if got := CalcCVaR(returns, c.confidence); got != 0 {
					t.Errorf("CalcCVaR(conf=%v) = %v, want 0", c.confidence, got)
				}
			})
		})
	}
}
func TestCalcCVaR_ConfidenceSubnormal(t *testing.T) {
	returns := []float64{-0.06, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.04}
	assertNoPanic(t, func() {
		if got := CalcCVaR(returns, 1e-300); math.IsNaN(got) || math.IsInf(got, 0) {
			t.Errorf("CalcCVaR(1e-300) = %v, want finite", got)
		}
	})
}
func TestCalcCVaR_NilSlice(t *testing.T) {
	assertNoPanic(t, func() {
		if got := CalcCVaR(nil, 0.95); got != 0 {
			t.Errorf("CalcCVaR(nil, 0.95) = %v, want 0", got)
		}
	})
}
func TestCalcSharpe_ZeroVolatility(t *testing.T) {
	identical := []float64{0.01, 0.01, 0.01, 0.01, 0.01}
	stdev := CalcAnnualizedStdev(identical)
	if stdev != 0 {
		t.Fatalf("expected zero stdev for identical returns, got %v", stdev)
	}
	if got := CalcSharpe(0.10, stdev); got != 0 {
		t.Errorf("CalcSharpe with zero stdev = %v, want 0", got)
	}
}
func TestCalcSortino_NilSlice(t *testing.T) {
	assertNoPanic(t, func() {
		if got := CalcSortino(0.10, nil); got != 0 {
			t.Errorf("CalcSortino(0.10, nil) = %v, want 0", got)
		}
	})
}
func TestCalcMaxDrawdown_NilSlice(t *testing.T) {
	assertNoPanic(t, func() {
		got := CalcMaxDrawdown(nil)
		if got.MaxDrawdown != 0 || got.MaxDrawdownDuration != 0 {
			t.Errorf("CalcMaxDrawdown(nil) = %+v, want zero value", got)
		}
	})
}
func TestCalculateStatisticsFromRequest_NilSlices(t *testing.T) {
	req := StatisticsRequest{Values: []float64{100, 101, 102, 103}, Dates: []string{"2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"}, StartingValue: 100}
	assertNoPanic(t, func() {
		stats := CalculateStatisticsFromRequest(req)
		if stats.Sharpe != 0 {
			t.Errorf("Sharpe = %v, want 0 for nil daily returns", stats.Sharpe)
		}
		if stats.Var.Daily.One != 0 || stats.Cvar.Daily.One != 0 {
			t.Errorf("Var.Daily.One=%v Cvar.Daily.One=%v, want 0 for nil slices", stats.Var.Daily.One, stats.Cvar.Daily.One)
		}
	})
}
