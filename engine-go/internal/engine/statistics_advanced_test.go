package engine

import (
	"math"
	"testing"
)

func assertFloatApprox(t *testing.T, got, want float64, label string, tol ...float64) {
	t.Helper()
	eps := 1e-10
	if len(tol) > 0 {
		eps = tol[0]
	}
	if math.Abs(got-want) > eps {
		t.Errorf("%s = %v, want %v", label, got, want)
	}
}
func TestCalcBeta(t *testing.T) {
	cases := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"insufficient data", []float64{0.01}, []float64{0.01}, 0},
		{"perfect correlation 2x", []float64{0.01, 0.02, 0.03}, []float64{0.005, 0.01, 0.015}, 2.0},
		{"zero benchmark variance", []float64{0.01, 0.02}, []float64{0, 0}, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcBeta(tc.portfolioReturns, tc.benchmarkReturns), tc.want, "CalcBeta")
		})
	}
}
func TestCalcAlpha(t *testing.T) {
	cases := []struct {
		name          string
		cagr          float64
		beta          float64
		benchmarkCagr float64
		want          float64
	}{
		{"matching benchmark", 0.10, 1.0, 0.10, 0.10 - (0.02 + 1.0*(0.10-0.02))},
		{"outperforming", 0.15, 1.2, 0.10, 0.15 - (0.02 + 1.2*(0.10-0.02))},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcAlpha(tc.cagr, tc.beta, tc.benchmarkCagr), tc.want, "CalcAlpha")
		})
	}
	t.Run("zero beta alpha equals excess return", func(t *testing.T) { assertFloatApprox(t, CalcAlpha(0.10, 0, 0.08), 0.10-0.02, "CalcAlpha") })
}
func TestCalcRSquared(t *testing.T) {
	cases := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"perfect fit", []float64{1, 2, 3}, []float64{2, 4, 6}, 1},
		{"no fit constant benchmark", []float64{1, 2, 3}, []float64{1, 1, 1}, 0},
		{"inverse perfect fit", []float64{1, 2, 3}, []float64{3, 2, 1}, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcRSquared(tc.portfolioReturns, tc.benchmarkReturns), tc.want, "CalcRSquared")
		})
	}
}
func TestCalcTrackingError(t *testing.T) {
	cases := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"insufficient data", []float64{0.01}, []float64{0.02}, 0},
		{"identical returns", []float64{0.01, 0.02}, []float64{0.01, 0.02}, 0},
		{"known deviation", []float64{0.04, 0, -0.04}, []float64{0, 0, 0}, math.Sqrt(0.0016) * math.Sqrt(252)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcTrackingError(tc.portfolioReturns, tc.benchmarkReturns), tc.want, "CalcTrackingError")
		})
	}
}
func TestCalcInformationRatio(t *testing.T) {
	cases := []struct {
		name          string
		alpha         float64
		trackingError float64
		want          float64
	}{
		{"zero tracking error", 0.05, 0, 0},
		{"normal case", 0.05, 0.10, 0.5},
		{"negative alpha", -0.02, 0.10, -0.2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcInformationRatio(tc.alpha, tc.trackingError), tc.want, "CalcInformationRatio")
		})
	}
}
func TestCalcCaptureRatios(t *testing.T) {
	cases := []struct {
		name   string
		upside bool
		p, b   []float64
		want   float64
	}{
		{"upside empty", true, nil, nil, 0},
		{"upside no upside days", true, []float64{-0.01, -0.02}, []float64{-0.01, -0.02}, 0},
		{"upside single upside day", true, []float64{0.10, -0.05}, []float64{0.05, -0.02}, 2.0},
		{"downside empty", false, nil, nil, 0},
		{"downside no downside days", false, []float64{0.01, 0.02}, []float64{0.01, 0.02}, 0},
		{"downside single downside day", false, []float64{-0.05, 0.10}, []float64{-0.02, 0.05}, 2.5},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcCaptureRatio(tc.p, tc.b, tc.upside), tc.want, "CaptureRatio")
		})
	}
}
func TestCalcVaR(t *testing.T) {
	cases := []struct {
		name         string
		dailyReturns []float64
		confidence   float64
		want         float64
	}{
		{"insufficient data", []float64{0.01}, 0.95, 0},
		{"95% confidence", []float64{-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04}, 0.95, 0.03},
		{"90% confidence", []float64{-0.05, -0.03, -0.02, 0, 0.01, 0.02, 0.03, 0.04}, 0.90, 0.05},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, CalcVaR(tc.dailyReturns, tc.confidence), tc.want, "CalcVaR") })
	}
}
func TestCalcCVaR(t *testing.T) {
	cases := []struct {
		name         string
		dailyReturns []float64
		confidence   float64
		want         float64
	}{
		{"insufficient data", []float64{0.01}, 0.95, 0},
		{"cutoff at index 0", []float64{-0.05, -0.03, -0.02, 0, 0.01, 0.02, 0.03, 0.04}, 0.90, 0.05},
		{"two tail values at 75pct confidence", []float64{-0.06, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.04}, 0.75, 0.05},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcCVaR(tc.dailyReturns, tc.confidence), tc.want, "CalcCVaR")
		})
	}
}
func TestCalcSkewness(t *testing.T) {
	cases := []struct {
		name    string
		returns []float64
		want    float64
	}{
		{"insufficient data", []float64{1, 2}, 0},
		{"symmetric", []float64{-2, -1, 0, 1, 2}, 0},
		{"zero variance", []float64{1, 1, 1}, 0},
		{"right skewed", []float64{1, 1, 1, 10}, 2.0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { assertFloatApprox(t, CalcSkewness(tc.returns), tc.want, "CalcSkewness") })
	}
}
func TestCalcExcessKurtosis(t *testing.T) {
	cases := []struct {
		name    string
		returns []float64
		want    float64
	}{
		{"insufficient data", []float64{1, 2, 3}, 0},
		{"zero variance", []float64{1, 1, 1, 1}, 0},
		{"uniform-like negative excess", []float64{-2, -1, 0, 1, 2}, -1.2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertFloatApprox(t, CalcExcessKurtosis(tc.returns), tc.want, "CalcExcessKurtosis")
		})
	}
}
func TestCalcPWR(t *testing.T) {
	t.Run("empty", func(t *testing.T) { assertFloatApprox(t, CalcPWR(nil), 0, "CalcPWR") })
	t.Run("consistent returns converge to return rate", func(t *testing.T) {
		annualReturns := make([]float64, 500)
		for i := range annualReturns {
			annualReturns[i] = 0.05
		}
		got := CalcPWR(annualReturns)
		if math.Abs(got-0.05) > 1e-3 {
			t.Errorf("CalcPWR() = %v, want ~0.05", got)
		}
	})
}
func TestCalcDrawdownCurve(t *testing.T) {
	values := []float64{100, 110, 90, 80, 110}
	dates := []string{"2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"}
	got := CalcDrawdownCurve(values, dates)
	if len(got) != len(values) {
		t.Fatalf("CalcDrawdownCurve() len = %v, want %v", len(got), len(values))
	}
	if got[0].Drawdown != 0 {
		t.Errorf("first point drawdown = %v, want 0", got[0].Drawdown)
	}
	assertFloatApprox(t, got[2].Drawdown, (110.0-90.0)/110.0, "point 2 drawdown")
	assertFloatApprox(t, got[3].Drawdown, (110.0-80.0)/110.0, "point 3 drawdown")
	if got[4].Drawdown != 0 {
		t.Errorf("recovery point drawdown = %v, want 0", got[4].Drawdown)
	}
}
func TestCalcRollingReturns(t *testing.T) {
	t.Run("insufficient window", func(t *testing.T) {
		if CalcRollingReturns([]float64{100, 110}, []string{"2024-01-01", "2024-01-02"}, 12) != nil {
			t.Error("expected nil for insufficient window")
		}
	})
	t.Run("empty values", func(t *testing.T) {
		if CalcRollingReturns(nil, nil, 1) != nil {
			t.Error("expected nil for empty values")
		}
	})
}
func TestCalcAnnualReturns(t *testing.T) {
	values := []float64{100, 110, 120, 130}
	dates := []string{"2023-01-01", "2023-06-01", "2024-01-01", "2024-06-01"}
	got := CalcAnnualReturns(values, dates)
	if len(got) == 0 {
		t.Fatal("CalcAnnualReturns() returned empty")
	}
	if got[0].Year != 2023 {
		t.Errorf("got[0].Year = %d, want 2023", got[0].Year)
	}
	assertFloatApprox(t, got[0].Return, 110.0/100.0-1, "2023 return")
	if len(got) > 1 {
		if got[1].Year != 2024 {
			t.Errorf("got[1].Year = %d, want 2024", got[1].Year)
		}
		assertFloatApprox(t, got[1].Return, 130.0/110.0-1, "2024 return")
	}
}
func TestCalcMonthlyReturns(t *testing.T) {
	values := []float64{100, 110, 120}
	dates := []string{"2024-01-05", "2024-01-15", "2024-02-05"}
	got := CalcMonthlyReturns(values, dates)
	if len(got) == 0 {
		t.Fatal("CalcMonthlyReturns() returned empty")
	}
	wants := map[int]float64{1: 0.1, 2: 0}
	found := map[int]bool{}
	for _, mr := range got {
		if mr.Year != 2024 {
			continue
		}
		if want, ok := wants[mr.Month]; ok {
			found[mr.Month] = true
			assertFloatApprox(t, mr.Return, want, "month return")
		}
	}
	for m := range wants {
		if !found[m] {
			t.Errorf("month %d not found in monthly returns", m)
		}
	}
}
