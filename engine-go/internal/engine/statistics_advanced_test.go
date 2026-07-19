package engine

import (
	"math"
	"testing"
)

func TestCalcBeta(t *testing.T) {
	tests := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"insufficient data", []float64{0.01}, []float64{0.01}, 0},
		{"perfect correlation 2x", []float64{0.01, 0.02, 0.03}, []float64{0.005, 0.01, 0.015}, 2.0},
		{"zero benchmark variance", []float64{0.01, 0.02}, []float64{0, 0}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcBeta(tt.portfolioReturns, tt.benchmarkReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcBeta() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcAlpha(t *testing.T) {
	tests := []struct {
		name          string
		cagr          float64
		beta          float64
		benchmarkCagr float64
		want          float64
	}{
		{"matching benchmark", 0.10, 1.0, 0.10, 0.10 - (0.02+1.0*(0.10-0.02))},
		{"outperforming", 0.15, 1.2, 0.10, 0.15 - (0.02+1.2*(0.10-0.02))},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcAlpha(tt.cagr, tt.beta, tt.benchmarkCagr)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcAlpha() = %v, want %v", got, tt.want)
			}
		})
	}

	t.Run("zero beta alpha equals excess return", func(t *testing.T) {
		got := CalcAlpha(0.10, 0, 0.08)
		want := 0.10 - 0.02
		if math.Abs(got-want) > 1e-10 {
			t.Errorf("CalcAlpha() = %v, want %v", got, want)
		}
	})
}

func TestCalcRSquared(t *testing.T) {
	tests := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"perfect fit", []float64{1, 2, 3}, []float64{2, 4, 6}, 1},
		{"no fit constant benchmark", []float64{1, 2, 3}, []float64{1, 1, 1}, 0},
		{"inverse perfect fit", []float64{1, 2, 3}, []float64{3, 2, 1}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcRSquared(tt.portfolioReturns, tt.benchmarkReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcRSquared() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcTrackingError(t *testing.T) {
	tests := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"insufficient data", []float64{0.01}, []float64{0.02}, 0},
		{"identical returns", []float64{0.01, 0.02}, []float64{0.01, 0.02}, 0},
		{"known deviation",
			[]float64{0.04, 0, -0.04},
			[]float64{0, 0, 0},
			math.Sqrt(0.0016) * math.Sqrt(252),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcTrackingError(tt.portfolioReturns, tt.benchmarkReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcTrackingError() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcInformationRatio(t *testing.T) {
	tests := []struct {
		name          string
		alpha         float64
		trackingError float64
		want          float64
	}{
		{"zero tracking error", 0.05, 0, 0},
		{"normal case", 0.05, 0.10, 0.5},
		{"negative alpha", -0.02, 0.10, -0.2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcInformationRatio(tt.alpha, tt.trackingError)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcInformationRatio() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcUpsideCapture(t *testing.T) {
	tests := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"empty", nil, nil, 0},
		{"no upside days", []float64{-0.01, -0.02}, []float64{-0.01, -0.02}, 0},
		{"single upside day",
			[]float64{0.10, -0.05},
			[]float64{0.05, -0.02},
			2.0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcUpsideCapture(tt.portfolioReturns, tt.benchmarkReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcUpsideCapture() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcDownsideCapture(t *testing.T) {
	tests := []struct {
		name             string
		portfolioReturns []float64
		benchmarkReturns []float64
		want             float64
	}{
		{"empty", nil, nil, 0},
		{"no downside days", []float64{0.01, 0.02}, []float64{0.01, 0.02}, 0},
		{"single downside day",
			[]float64{-0.05, 0.10},
			[]float64{-0.02, 0.05},
			2.5,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcDownsideCapture(tt.portfolioReturns, tt.benchmarkReturns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcDownsideCapture() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcVaR(t *testing.T) {
	tests := []struct {
		name         string
		dailyReturns []float64
		confidence   float64
		want         float64
	}{
		{"insufficient data", []float64{0.01}, 0.95, 0},
		{"95% confidence",
			[]float64{-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04},
			0.95,
			0.03,
		},
		{"90% confidence",
			[]float64{-0.05, -0.03, -0.02, 0, 0.01, 0.02, 0.03, 0.04},
			0.90,
			0.05,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcVaR(tt.dailyReturns, tt.confidence)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcVaR() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcCVaR(t *testing.T) {
	tests := []struct {
		name         string
		dailyReturns []float64
		confidence   float64
		want         float64
	}{
		{"insufficient data", []float64{0.01}, 0.95, 0},
		{"cutoff at index 0",
			[]float64{-0.05, -0.03, -0.02, 0, 0.01, 0.02, 0.03, 0.04},
			0.90,
			0.05,
		},
		{"two tail values at 75pct confidence",
			[]float64{-0.06, -0.04, -0.02, 0, 0.01, 0.02, 0.03, 0.04},
			0.75,
			0.05,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcCVaR(tt.dailyReturns, tt.confidence)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcCVaR() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcSkewness(t *testing.T) {
	tests := []struct {
		name    string
		returns []float64
		want    float64
	}{
		{"insufficient data", []float64{1, 2}, 0},
		{"symmetric", []float64{-2, -1, 0, 1, 2}, 0},
		{"zero variance", []float64{1, 1, 1}, 0},
		{"right skewed",
			[]float64{1, 1, 1, 10},
			2.0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcSkewness(tt.returns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcSkewness() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcExcessKurtosis(t *testing.T) {
	tests := []struct {
		name    string
		returns []float64
		want    float64
	}{
		{"insufficient data", []float64{1, 2, 3}, 0},
		{"zero variance", []float64{1, 1, 1, 1}, 0},
		{"uniform-like negative excess",
			[]float64{-2, -1, 0, 1, 2},
			-1.2,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalcExcessKurtosis(tt.returns)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("CalcExcessKurtosis() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalcPWR(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		if got := CalcPWR(nil); got != 0 {
			t.Errorf("CalcPWR() = %v, want 0", got)
		}
	})

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
	if got[2].Drawdown != (110.0-90.0)/110.0 {
		t.Errorf("point 2 drawdown = %v, want %v", got[2].Drawdown, (110.0-90.0)/110.0)
	}
	if got[3].Drawdown != (110.0-80.0)/110.0 {
		t.Errorf("point 3 drawdown = %v, want %v", got[3].Drawdown, (110.0-80.0)/110.0)
	}
	if got[4].Drawdown != 0 {
		t.Errorf("recovery point drawdown = %v, want 0", got[4].Drawdown)
	}
}

func TestCalcRollingReturns(t *testing.T) {
	t.Run("insufficient window", func(t *testing.T) {
		values := []float64{100, 110}
		dates := []string{"2024-01-01", "2024-01-02"}
		got := CalcRollingReturns(values, dates, 12)
		if got != nil {
			t.Error("expected nil for insufficient window")
		}
	})

	t.Run("empty values", func(t *testing.T) {
		got := CalcRollingReturns(nil, nil, 1)
		if got != nil {
			t.Error("expected nil for empty values")
		}
	})
}

func TestCalcAnnualReturns(t *testing.T) {
	// first year uses values[0] as start, subsequent years use previous year's last value as start
	values := []float64{100, 110, 120, 130}
	dates := []string{"2023-01-01", "2023-06-01", "2024-01-01", "2024-06-01"}
	got := CalcAnnualReturns(values, dates)
	if len(got) == 0 {
		t.Fatal("CalcAnnualReturns() returned empty")
	}
	if got[0].Year != 2023 || math.Abs(got[0].Return-(110.0/100.0-1)) > 1e-10 {
		t.Errorf("2023: got %+v, want return=%v", got[0], 110.0/100.0-1)
	}
	if len(got) > 1 {
		if got[1].Year != 2024 || math.Abs(got[1].Return-(130.0/110.0-1)) > 1e-10 {
			t.Errorf("2024: got %+v, want return=%v", got[1], 130.0/110.0-1)
		}
	}
}

func TestCalcMonthlyReturns(t *testing.T) {
	values := []float64{100, 110, 120}
	dates := []string{"2024-01-05", "2024-01-15", "2024-02-05"}
	got := CalcMonthlyReturns(values, dates)
	if len(got) == 0 {
		t.Fatal("CalcMonthlyReturns() returned empty")
	}
	// January: first=100, last=110 → return 0.1
	// February: first=120, last=120 → return 0
	foundJan := false
	foundFeb := false
	for _, mr := range got {
		if mr.Year == 2024 && mr.Month == 1 {
			foundJan = true
			if math.Abs(mr.Return-0.1) > 1e-10 {
				t.Errorf("Jan return = %v, want 0.1", mr.Return)
			}
		}
		if mr.Year == 2024 && mr.Month == 2 {
			foundFeb = true
			if math.Abs(mr.Return) > 1e-10 {
				t.Errorf("Feb return = %v, want 0", mr.Return)
			}
		}
	}
	if !foundJan {
		t.Error("January not found in monthly returns")
	}
	if !foundFeb {
		t.Error("February not found in monthly returns")
	}
}
