package engine

import (
	"math"
	"testing"
)

const goldenRiskFreeRate = 0.02 // engineutil.RiskFreeRate (2%)
func approxEqual(actual, expected, tol float64) bool {
	return math.Abs(actual-expected) < tol
}
func TestGoldenCAGR(t *testing.T) {
	const (
		startValue = 100.0
		endValue   = 200.0
		years      = 5.0
		want       = 0.148698354997035
		tol        = 1e-6
	)
	got := CalcCAGR(startValue, endValue, years)
	if !approxEqual(got, want, tol) {
		t.Errorf("CAGR(100->200, 5y) = %.10f, want %.10f (2^(1/5)-1)", got, want)
	}
}
func TestGoldenMaxDrawdown(t *testing.T) {
	values := []float64{100, 120, 80, 100}
	const (
		wantDD       = 1.0 / 3.0
		wantDuration = 1
		tol          = 1e-6
	)
	got := CalcMaxDrawdown(values)
	if !approxEqual(got.MaxDrawdown, wantDD, tol) {
		t.Errorf("MaxDrawdown = %.10f, want %.10f (40/120)", got.MaxDrawdown, wantDD)
	}
	if got.MaxDrawdownDuration != wantDuration {
		t.Errorf("MaxDrawdownDuration = %d, want %d", got.MaxDrawdownDuration, wantDuration)
	}
}
func TestGoldenSharpe(t *testing.T) {
	dailyReturns := []float64{0.03, -0.01, -0.01, -0.01}
	const cagr = 0.10
	wantStdev := 0.02 * math.Sqrt(252) // hand-derived annualized stdev
	gotStdev := CalcAnnualizedStdev(dailyReturns)
	if !approxEqual(gotStdev, wantStdev, 1e-10) {
		t.Errorf("annualized stdev = %.10f, want %.10f (0.02*sqrt(252))", gotStdev, wantStdev)
	}
	wantSharpe := (cagr - goldenRiskFreeRate) / wantStdev // 0.08 / (0.02*sqrt(252))
	gotSharpe := CalcSharpe(cagr, wantStdev)
	if !approxEqual(gotSharpe, wantSharpe, 1e-6) {
		t.Errorf("Sharpe = %.10f, want %.10f ((0.10-0.02)/(0.02*sqrt(252)))", gotSharpe, wantSharpe)
	}
}
func TestGoldenAlpha(t *testing.T) {
	const (
		cagr          = 0.10
		beta          = 1.0
		benchmarkCagr = 0.08
		want          = 0.02
		tol           = 1e-10
	)
	got := CalcAlpha(cagr, beta, benchmarkCagr)
	if !approxEqual(got, want, tol) {
		t.Errorf("Alpha = %.10f, want %.10f", got, want)
	}
}
func TestGoldenBeta(t *testing.T) {
	portfolio := []float64{0.02, 0.04, 0.06, 0.08}
	benchmark := []float64{0.01, 0.02, 0.03, 0.04}
	const (
		want = 2.0
		tol  = 1e-10
	)
	got := CalcBeta(portfolio, benchmark)
	if !approxEqual(got, want, tol) {
		t.Errorf("Beta = %.10f, want %.10f (portfolio = 2x benchmark)", got, want)
	}
}
func TestGoldenVaR(t *testing.T) {
	returns := []float64{-0.10, -0.09, -0.08, -0.07, -0.06, -0.05, -0.04, -0.03, -0.02, -0.01, 0.00, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09}
	const tol = 1e-10
	cases := []struct {
		confidence float64
		want       float64
	}{
		{0.95, 0.09}, // 5% tail of 20 = 1 sample -> 2nd-smallest return -0.09 -> loss 0.09
		{0.99, 0.10}, // 1% tail of 20 = 0.2 -> index 0 -> smallest return -0.10 -> loss 0.10
	}
	for _, c := range cases {
		got := CalcVaR(returns, c.confidence)
		if !approxEqual(got, c.want, tol) {
			t.Errorf("VaR(conf=%.2f) = %.10f, want %.10f", c.confidence, got, c.want)
		}
	}
}
func TestGoldenPWR(t *testing.T) {
	const (
		r   = 0.05
		n   = 30
		tol = 1e-6
	)
	annualReturns := make([]float64, n)
	for i := range annualReturns {
		annualReturns[i] = r
	}
	want := r * math.Pow(1+r, float64(n)) / (math.Pow(1+r, float64(n)) - 1)
	got := CalcPWR(annualReturns)
	if !approxEqual(got, want, tol) {
		t.Errorf("PWR(5%% x 30y) = %.10f, want %.10f (annuity boundary)", got, want)
	}
}
func TestGoldenSWR(t *testing.T) {
	const (
		badYear = -0.9
		r       = 0.07
		years   = 30
		tol     = 1e-4
	)
	annualReturns := make([]float64, 49)
	annualReturns[0] = badYear
	for i := 1; i < len(annualReturns); i++ {
		annualReturns[i] = r
	}
	wantSWR := r * math.Pow(1+r, float64(years)) / (math.Pow(1+r, float64(years)) - 1)
	gotSWR := CalcSWR(annualReturns, years, 0.95)
	gotPWR := CalcSWR(annualReturns, years, 1.0)
	if !approxEqual(gotSWR, wantSWR, tol) {
		t.Errorf("SWR = %.10f, want %.10f (7%% 30y annuity boundary)", gotSWR, wantSWR)
	}
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
