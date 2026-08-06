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

func TestRiskMetricEdgeCases(t *testing.T) {
	var (
		vaRReturns  = []float64{-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04}
		cvaRReturns = []float64{-0.06, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.04}
	)
	cases := []struct {
		name       string
		calc       func(returns []float64, confidence float64) float64
		returns    []float64
		confidence float64
		wantFinite bool
	}{
		{"var zero", CalcVaR, vaRReturns, 0, false},
		{"var negative", CalcVaR, vaRReturns, -0.5, false},
		{"var exactly one", CalcVaR, vaRReturns, 1.0, false},
		{"var above one", CalcVaR, vaRReturns, 1.5, false},
		{"var subnormal", CalcVaR, vaRReturns, 1e-300, true},
		{"var nil", CalcVaR, nil, 0.95, false},
		{"cvar zero", CalcCVaR, cvaRReturns, 0, false},
		{"cvar negative", CalcCVaR, cvaRReturns, -0.5, false},
		{"cvar exactly one", CalcCVaR, cvaRReturns, 1.0, false},
		{"cvar above one", CalcCVaR, cvaRReturns, 1.5, false},
		{"cvar subnormal", CalcCVaR, cvaRReturns, 1e-300, true},
		{"cvar nil", CalcCVaR, nil, 0.95, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assertNoPanic(t, func() {
				got := c.calc(c.returns, c.confidence)
				if c.wantFinite {
					if math.IsNaN(got) || math.IsInf(got, 0) {
						t.Errorf("want finite, got %v", got)
					}
					return
				}
				if got != 0 {
					t.Errorf("calc(conf=%v) = %v, want 0", c.confidence, got)
				}
			})
		})
	}
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
