package engineutil

import (
	"math"
	"testing"
	"time"
)

func floatPtr(v float64) *float64 {
	return &v
}

func TestShouldRebalanceDaily(t *testing.T) {
	if !ShouldRebalance("daily", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil) {
		t.Error("daily should always rebalance")
	}
}

func TestShouldRebalanceNone(t *testing.T) {
	if ShouldRebalance("none", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil) {
		t.Error("none should never rebalance")
	}
}

func TestShouldRebalanceWeekly(t *testing.T) {
	tests := []struct {
		name string
		prev string
		curr string
		want bool
	}{
		{"same week Monday-Wednesday", "2024-01-01", "2024-01-03", false},
		{"same week Thursday-Friday", "2024-01-04", "2024-01-05", false},
		{"different week Friday-Monday", "2024-01-05", "2024-01-08", true},
		{"year boundary different week", "2023-12-31", "2024-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("weekly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("ShouldRebalance(weekly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceMonthly(t *testing.T) {
	tests := []struct {
		name string
		prev string
		curr string
		want bool
	}{
		{"same month", "2024-01-05", "2024-01-20", false},
		{"different month", "2024-01-31", "2024-02-01", true},
		{"year boundary different month", "2023-12-31", "2024-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("monthly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("ShouldRebalance(monthly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceQuarterly(t *testing.T) {
	tests := []struct {
		name string
		prev string
		curr string
		want bool
	}{
		{"same quarter", "2024-01-15", "2024-03-20", false},
		{"adjacent quarter", "2024-03-31", "2024-04-01", true},
		{"year boundary same Q1", "2024-01-01", "2024-02-01", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("quarterly", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("ShouldRebalance(quarterly, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}

func TestShouldRebalanceAnnual(t *testing.T) {
	tests := []struct {
		name string
		prev string
		curr string
		want bool
	}{
		{"same year", "2024-01-01", "2024-12-31", false},
		{"different year", "2024-12-31", "2025-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("annual", tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("ShouldRebalance(annual, %q, %q) = %v, want %v", tt.prev, tt.curr, got, tt.want)
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
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance when all deviations < 10%")
		}
	})

	t.Run("above threshold triggers rebalance", func(t *testing.T) {
		// 55% vs 60% target: dev = |0.55-0.60|/0.60 = 8.33% < 10%
		// 45% vs 40% target: dev = |0.45-0.40|/0.40 = 12.5% >= 10% → triggers
		holdings := []float64{55, 45}
		weights := []float64{0.60, 0.40}
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 100, nil)
		if !got {
			t.Error("expected rebalance when asset deviation >= 10%")
		}
	})

	t.Run("zero threshold does not trigger", func(t *testing.T) {
		holdings := []float64{80, 20}
		weights := []float64{0.60, 0.40}
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance with threshold=0")
		}
	})

	t.Run("zero pv does not trigger", func(t *testing.T) {
		holdings := []float64{0, 0}
		weights := []float64{0.60, 0.40}
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 10.0, holdings, weights, 0, nil)
		if got {
			t.Error("expected no rebalance with pv=0")
		}
	})

	t.Run("zero weight asset skipped", func(t *testing.T) {
		holdings := []float64{100, 0}
		weights := []float64{1.0, 0}
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 5.0, holdings, weights, 100, nil)
		if got {
			t.Error("expected no rebalance when zero-weight asset deviates")
		}
	})

	t.Run("empty holdings", func(t *testing.T) {
		got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", 5.0, nil, nil, 0, nil)
		if got {
			t.Error("expected no rebalance with empty holdings")
		}
	})
}

func TestShouldRebalanceBandsAbsolute(t *testing.T) {
	t.Run("within absolute band", func(t *testing.T) {
		holdings := []float64{52, 48}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{AbsoluteBand: floatPtr(5.0)}
		got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance with 2% drift within 5% band")
		}
	})

	t.Run("exceeds absolute band", func(t *testing.T) {
		holdings := []float64{60, 40}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{AbsoluteBand: floatPtr(5.0)}
		got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("expected rebalance with 10% drift exceeding 5% band")
		}
	})

	t.Run("frequency trigger before bands check", func(t *testing.T) {
		holdings := []float64{51, 49}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{AbsoluteBand: floatPtr(1.0)}
		got := ShouldRebalance("daily", "2024-01-01", "2024-01-02", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("daily frequency should trigger before bands check")
		}
	})
}

func TestShouldRebalanceBandsRelative(t *testing.T) {
	t.Run("within relative band", func(t *testing.T) {
		holdings := []float64{52, 48}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{RelativeBand: floatPtr(10.0)}
		got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance with 4% relative drift within 10% band")
		}
	})

	t.Run("exceeds relative band", func(t *testing.T) {
		holdings := []float64{60, 40}
		weights := []float64{0.50, 0.50}
		bands := &RebalanceBands{RelativeBand: floatPtr(10.0)}
		got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if !got {
			t.Error("expected rebalance with 20% relative drift exceeding 10% band")
		}
	})

	t.Run("zero weight skipped in relative band", func(t *testing.T) {
		holdings := []float64{100, 0}
		weights := []float64{1.0, 0}
		bands := &RebalanceBands{RelativeBand: floatPtr(5.0)}
		got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, holdings, weights, 100, bands)
		if got {
			t.Error("expected no rebalance for zero-weight asset")
		}
	})
}

func TestShouldRebalanceInvalidFrequency(t *testing.T) {
	got := ShouldRebalance("invalid", "2024-01-01", "2024-01-02", 0, nil, nil, 0, nil)
	if got {
		t.Error("invalid frequency should not rebalance")
	}
}

func TestShouldRebalanceBadDate(t *testing.T) {
	t.Run("weekly bad date", func(t *testing.T) {
		got := ShouldRebalance("weekly", "not-a-date", "2024-01-08", 0, nil, nil, 0, nil)
		if got {
			t.Error("bad date should not trigger rebalance")
		}
	})

	t.Run("monthly bad date", func(t *testing.T) {
		got := ShouldRebalance("monthly", "2024-01-01", "bad-date", 0, nil, nil, 0, nil)
		if got {
			t.Error("bad date should not trigger rebalance")
		}
	})
}

func TestNormalizeWeights(t *testing.T) {
	t.Run("normalizes to sum 1", func(t *testing.T) {
		got := NormalizeWeights([]float64{1, 2, 3})
		want := []float64{1.0 / 6, 2.0 / 6, 3.0 / 6}
		for i := range got {
			if math.Abs(got[i]-want[i]) > 1e-9 {
				t.Errorf("NormalizeWeights[%d] = %v, want %v", i, got[i], want[i])
			}
		}
	})

	t.Run("zero sum falls back to equal weights", func(t *testing.T) {
		got := NormalizeWeights([]float64{0, 0, 0, 0})
		for _, v := range got {
			if v != 0.25 {
				t.Errorf("NormalizeWeights zero sum expected 0.25, got %v", v)
			}
		}
	})

	t.Run("negative sum falls back to equal weights", func(t *testing.T) {
		got := NormalizeWeights([]float64{-1, -2})
		for _, v := range got {
			if v != 0.5 {
				t.Errorf("NormalizeWeights negative sum expected 0.5, got %v", v)
			}
		}
	})

	t.Run("does not mutate input", func(t *testing.T) {
		in := []float64{1, 2, 3}
		_ = NormalizeWeights(in)
		if in[0] != 1 || in[1] != 2 || in[2] != 3 {
			t.Errorf("NormalizeWeights mutated input: %v", in)
		}
	})
}

func TestParseDate(t *testing.T) {
	t.Run("valid date", func(t *testing.T) {
		got := ParseDate("2024-03-15")
		want := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)
		if !got.Equal(want) {
			t.Errorf("ParseDate = %v, want %v", got, want)
		}
	})

	t.Run("date with time prefix truncated", func(t *testing.T) {
		got := ParseDate("2024-03-15T10:30:00Z")
		want := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)
		if !got.Equal(want) {
			t.Errorf("ParseDate = %v, want %v", got, want)
		}
	})

	t.Run("short string returns normalized zero-input date", func(t *testing.T) {
		// 保持原 tactical.parseDate 行为：长度 < 10 时 year/month/day 全为 0，
		// time.Date(0, 0, 0, ...) 经 Go 规范化为 -0001-11-30（非零 time）。
		// 调用方（shouldRebalance）仅在已校验的日期字符串上调用，此分支不会触达。
		got := ParseDate("2024")
		if got.IsZero() {
			t.Errorf("ParseDate short string expected non-zero (normalized) time per legacy behavior, got zero")
		}
	})
}

func TestGetISOWeek(t *testing.T) {
	// 2024-01-01 is a Monday in ISO week 1.
	got := GetISOWeek(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC))
	if got != 1 {
		t.Errorf("GetISOWeek(2024-01-01) = %d, want 1", got)
	}
	// 2024-02-15 is in ISO week 7.
	got = GetISOWeek(time.Date(2024, 2, 15, 0, 0, 0, 0, time.UTC))
	if got != 7 {
		t.Errorf("GetISOWeek(2024-02-15) = %d, want 7", got)
	}
}
