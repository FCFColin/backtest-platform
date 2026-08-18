package engine

import (
	"engine-go/internal/enginetest"
	"fmt"
	"math"
	"testing"
)

func TestGoldenCAGR(t *testing.T) {
	got := CalcCAGR(100.0, 200.0, 5.0)
	assertFloatApprox(t, got, 0.148698354997035, "CAGR(100->200, 5y) (2^(1/5)-1)", 1e-6)
}
func TestGoldenMaxDrawdown(t *testing.T) {
	values := []float64{100, 120, 80, 100}
	got := CalcMaxDrawdown(values)
	assertFloatApprox(t, got.MaxDrawdown, 1.0/3.0, "MaxDrawdown (40/120)", 1e-6)
	if got.MaxDrawdownDuration != 1 {
		t.Errorf("MaxDrawdownDuration = %d, want 1", got.MaxDrawdownDuration)
	}
}
func TestGoldenSharpe(t *testing.T) {
	dailyReturns := []float64{0.03, -0.01, -0.01, -0.01}
	const cagr = 0.10
	wantStdev := 0.02 * math.Sqrt(252) // hand-derived annualized stdev
	gotStdev := CalcAnnualizedStdev(dailyReturns)
	assertFloatApprox(t, gotStdev, wantStdev, "annualized stdev (0.02*sqrt(252))")
	wantSharpe := (cagr - 0.02) / wantStdev // 0.08 / (0.02*sqrt(252))
	gotSharpe := CalcSharpe(cagr, wantStdev)
	assertFloatApprox(t, gotSharpe, wantSharpe, "Sharpe ((0.10-0.02)/(0.02*sqrt(252)))", 1e-6)
}
func TestGoldenAlpha(t *testing.T) {
	got := CalcAlpha(0.10, 1.0, 0.08)
	assertFloatApprox(t, got, 0.02, "Alpha")
}
func TestGoldenBeta(t *testing.T) {
	portfolio := []float64{0.02, 0.04, 0.06, 0.08}
	benchmark := []float64{0.01, 0.02, 0.03, 0.04}
	got := CalcBeta(portfolio, benchmark)
	assertFloatApprox(t, got, 2.0, "Beta (portfolio = 2x benchmark)")
}
func TestGoldenVaR(t *testing.T) {
	returns := []float64{-0.10, -0.09, -0.08, -0.07, -0.06, -0.05, -0.04, -0.03, -0.02, -0.01, 0.00, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09}
	cases := []struct {
		confidence float64
		want       float64
	}{
		{0.95, 0.09}, // 5% tail of 20 = 1 sample -> 2nd-smallest return -0.09 -> loss 0.09
		{0.99, 0.10}, // 1% tail of 20 = 0.2 -> index 0 -> smallest return -0.10 -> loss 0.10
	}
	for _, c := range cases {
		got := CalcVaR(returns, c.confidence)
		assertFloatApprox(t, got, c.want, fmt.Sprintf("VaR(conf=%.2f)", c.confidence))
	}
}
func TestGoldenPWR(t *testing.T) {
	const r = 0.05
	const n = 30
	annualReturns := enginetest.UniformAnnualReturns(n, r)
	want := r * math.Pow(1+r, float64(n)) / (math.Pow(1+r, float64(n)) - 1)
	got := CalcPWR(annualReturns)
	assertFloatApprox(t, got, want, "PWR(5% x 30y) (annuity boundary)", 1e-6)
}
func TestGoldenSWR(t *testing.T) {
	const (
		badYear = -0.9
		r       = 0.07
		years   = 30
	)
	annualReturns := make([]float64, 49)
	annualReturns[0] = badYear
	for i := 1; i < len(annualReturns); i++ {
		annualReturns[i] = r
	}
	wantSWR := r * math.Pow(1+r, float64(years)) / (math.Pow(1+r, float64(years)) - 1)
	gotSWR := CalcSWR(annualReturns, years, 0.95)
	gotPWR := CalcSWR(annualReturns, years, 1.0)
	assertFloatApprox(t, gotSWR, wantSWR, "SWR (7% 30y annuity boundary)", 1e-4)
	if !(gotPWR > 0) {
		t.Errorf("PWR = %.10f, want > 0", gotPWR)
	}
	if !(gotPWR < gotSWR) {
		t.Errorf("expected PWR < SWR for same data; got PWR=%.10f SWR=%.10f", gotPWR, gotSWR)
	}
	if gotPWR == gotSWR {
		t.Errorf("expected SWR != PWR; both = %.10f", gotSWR)
	}
}
