package engine

import (
	"testing"
)

func floatPtr(v float64) *float64 {
	return &v
}

func TestShouldRebalanceDaily(t *testing.T) {
	if !shouldRebalance("daily", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil) {
		t.Error("daily should always rebalance")
	}
}

func TestShouldRebalanceNone(t *testing.T) {
	if shouldRebalance("none", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil) {
		t.Error("none should never rebalance")
	}
}

func TestShouldRebalanceWeekly(t *testing.T) {
	tests := []struct {
		name     string
		prev     string
		curr     string
		want     bool
	}{
		{"same week Monday-Wednesday", "2024-01-01", "2024-01-03", false},
		{"same week Thursday-Friday", "2024-01-04", "2024-01-05", false},
		{"different week Friday-Monday", "2024-01-05", "2024-01-08", true},
		{"year boundary different week", "2023-12-31", "2024-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldRebalance("weekly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("shouldRebalance(weekly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceMonthly(t *testing.T) {
	tests := []struct {
		name     string
		prev     string
		curr     string
		want     bool
	}{
		{"same month", "2024-01-05", "2024-01-20", false},
		{"different month", "2024-01-31", "2024-02-01", true},
		{"year boundary different month", "2023-12-31", "2024-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldRebalance("monthly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("shouldRebalance(monthly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceQuarterly(t *testing.T) {
	tests := []struct {
		name     string
		prev     string
		curr     string
		want     bool
	}{
		{"same quarter", "2024-01-15", "2024-03-20", false},
		{"adjacent quarter", "2024-03-31", "2024-04-01", true},
		{"year boundary same Q1", "2024-01-01", "2024-02-01", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldRebalance("quarterly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("shouldRebalance(quarterly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceAnnual(t *testing.T) {
	tests := []struct {
		name     string
		prev     string
		curr     string
		want     bool
	}{
		{"same year", "2024-01-01", "2024-12-31", false},
		{"different year", "2024-12-31", "2025-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldRebalance("annual", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("shouldRebalance(annual, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceThreshold(t *testing.T) {
	t.Run("below threshold no rebalance", func(t *testing.T) {
		// 57% vs 60% target: dev = |0.57-0.60|/0.60 = 5% < 10%
		// 43% vs 40% target: dev = |0.43-0.40|/0.40 = 7.5% < 10%
		holdings := []float64{57, 43}
		weights := []float64{0.60, 0.40}
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance when all deviations < 10%")
		}
	})

	t.Run("above threshold triggers rebalance", func(t *testing.T) {
		// 55% vs 60% target: dev = |0.55-0.60|/0.60 = 8.33% < 10%
		// 45% vs 40% target: dev = |0.45-0.40|/0.40 = 12.5% >= 10% → triggers
		holdings := []float64{55, 45}
		weights := []float64{0.60, 0.40}
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 100, nil)
		if !got {
			t.Error("expected rebalance when asset deviation >= 10%")
		}
	})

	t.Run("zero threshold does not trigger", func(t *testing.T) {
		holdings := []float64{80, 20}
		weights := []float64{0.60, 0.40}
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance with threshold=0")
		}
	})

	t.Run("zero pv does not trigger", func(t *testing.T) {
		holdings := []float64{0, 0}
		weights := []float64{0.60, 0.40}
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 0, nil)
		if got {
			t.Error("expected no rebalance with pv=0")
		}
	})

	t.Run("zero weight asset skipped", func(t *testing.T) {
		holdings := []float64{100, 0}
		weights := []float64{1.0, 0}
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 5.0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance when zero-weight asset deviates")
		}
	})

	t.Run("empty holdings", func(t *testing.T) {
		got := shouldRebalance("threshold", "2024-01-01", "2024-01-02", 5.0, nil, nil, 0, nil)
		if got {
			t.Error("expected no rebalance with empty holdings")
		}
	})
}

func TestShouldRebalanceBandsAbsolute(t *testing.T) {
	t.Run("within absolute band", func(t *testing.T) {
		holdings := []float64{52, 48}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{Absolute: floatPtr(5.0)}
		got := shouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance with 2% drift within 5% band")
		}
	})

	t.Run("exceeds absolute band", func(t *testing.T) {
		holdings := []float64{60, 40}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{Absolute: floatPtr(5.0)}
		got := shouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("expected rebalance with 10% drift exceeding 5% band")
		}
	})

	t.Run("frequency trigger before bands check", func(t *testing.T) {
		holdings := []float64{51, 49}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{Absolute: floatPtr(1.0)}
		got := shouldRebalance("daily", "2024-01-01", "2024-01-02", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("daily frequency should trigger before bands check")
		}
	})
}

func TestShouldRebalanceBandsRelative(t *testing.T) {
	t.Run("within relative band", func(t *testing.T) {
		holdings := []float64{52, 48}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{Relative: floatPtr(10.0)}
		got := shouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance with 4% relative drift within 10% band")
		}
	})

	t.Run("exceeds relative band", func(t *testing.T) {
		holdings := []float64{60, 40}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{Relative: floatPtr(10.0)}
		got := shouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("expected rebalance with 20% relative drift exceeding 10% band")
		}
	})

	t.Run("zero weight skipped in relative band", func(t *testing.T) {
		holdings := []float64{100, 0}
		weights := []float64{1.0, 0}
		bands := &RebalanceBands{Relative: floatPtr(5.0)}
		got := shouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance for zero-weight asset")
		}
	})
}

func TestShouldRebalanceInvalidFrequency(t *testing.T) {
	got := shouldRebalance("invalid", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil)
	if got {
		t.Error("invalid frequency should not rebalance")
	}
}

func TestShouldRebalanceBadDate(t *testing.T) {
	t.Run("weekly bad date", func(t *testing.T) {
		got := shouldRebalance("weekly", "not-a-date", "2024-01-08", 0, nil, nil, 0, nil)
		if got {
			t.Error("bad date should not trigger rebalance")
		}
	})

	t.Run("monthly bad date", func(t *testing.T) {
		got := shouldRebalance("monthly", "2024-01-01", "bad-date", 0, nil, nil, 0, nil)
		if got {
			t.Error("bad date should not trigger rebalance")
		}
	})
}
