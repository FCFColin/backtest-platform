package engineutil

import (
	"math"
	"testing"
)

func floatPtr(v float64) *float64 {
	return &v
}
func TestShouldRebalancePeriods(t *testing.T) {
	tests := []struct {
		name      string
		frequency string
		prev      string
		curr      string
		want      bool
	}{
		{"daily always rebalances", "daily", "2024-01-01", "2024-01-02", true},
		{"none never rebalances", "none", "2024-01-01", "2024-01-02", false},
		{"invalid frequency", "invalid", "2024-01-01", "2024-01-02", false},
		{"weekly same week Monday-Wednesday", "weekly", "2024-01-01", "2024-01-03", false},
		{"weekly same week Thursday-Friday", "weekly", "2024-01-04", "2024-01-05", false},
		{"weekly different week Friday-Monday", "weekly", "2024-01-05", "2024-01-08", true},
		{"weekly year boundary different week", "weekly", "2023-12-31", "2024-01-01", true},
		{"weekly bad date", "weekly", "not-a-date", "2024-01-08", false},
		{"monthly same month", "monthly", "2024-01-05", "2024-01-20", false},
		{"monthly different month", "monthly", "2024-01-31", "2024-02-01", true},
		{"monthly year boundary different month", "monthly", "2023-12-31", "2024-01-01", true},
		{"monthly bad date", "monthly", "2024-01-01", "bad-date", false},
		{"quarterly same quarter", "quarterly", "2024-01-15", "2024-03-20", false},
		{"quarterly adjacent quarter", "quarterly", "2024-03-31", "2024-04-01", true},
		{"quarterly year boundary same Q1", "quarterly", "2024-01-01", "2024-02-01", false},
		{"annual same year", "annual", "2024-01-01", "2024-12-31", false},
		{"annual different year", "annual", "2024-12-31", "2025-01-01", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance(tt.frequency, tt.prev, tt.curr, 0, nil, nil, 0, nil)
			if got != tt.want {
				t.Errorf("ShouldRebalance(%s, %q, %q) = %v, want %v", tt.frequency, tt.prev, tt.curr, got, tt.want)
			}
		})
	}
}
func TestShouldRebalanceThreshold(t *testing.T) {
	tests := []struct {
		name      string
		threshold float64
		holdings  []float64
		weights   []float64
		pv        float64
		want      bool
	}{
		{"below threshold no rebalance", 10.0, []float64{57, 43}, []float64{0.60, 0.40}, 100, false},
		{"above threshold triggers rebalance", 10.0, []float64{55, 45}, []float64{0.60, 0.40}, 100, true},
		{"zero threshold does not trigger", 0, []float64{80, 20}, []float64{0.60, 0.40}, 100, false},
		{"zero pv does not trigger", 10.0, []float64{0, 0}, []float64{0.60, 0.40}, 0, false},
		{"zero weight asset skipped", 5.0, []float64{100, 0}, []float64{1.0, 0}, 100, false},
		{"empty holdings", 5.0, nil, nil, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("threshold", "2024-01-01", "2024-01-02", tt.threshold, tt.holdings, tt.weights, tt.pv, nil)
			if got != tt.want {
				t.Errorf("threshold=%v holdings=%v weights=%v pv=%v => %v, want %v", tt.threshold, tt.holdings, tt.weights, tt.pv, got, tt.want)
			}
		})
	}
}
func TestShouldRebalanceBands(t *testing.T) {
	tests := []struct {
		name     string
		bands    *RebalanceBands
		holdings []float64
		weights  []float64
		want     bool
	}{
		{"within absolute band", &RebalanceBands{AbsoluteBand: floatPtr(5.0)}, []float64{52, 48}, []float64{0.50, 0.50}, false},
		{"exceeds absolute band", &RebalanceBands{AbsoluteBand: floatPtr(5.0)}, []float64{60, 40}, []float64{0.50, 0.50}, true},
		{"within relative band", &RebalanceBands{RelativeBand: floatPtr(10.0)}, []float64{52, 48}, []float64{0.50, 0.50}, false},
		{"exceeds relative band", &RebalanceBands{RelativeBand: floatPtr(10.0)}, []float64{60, 40}, []float64{0.50, 0.50}, true},
		{"zero weight skipped in relative band", &RebalanceBands{RelativeBand: floatPtr(5.0)}, []float64{100, 0}, []float64{1.0, 0}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ShouldRebalance("monthly", "2024-01-01", "2024-01-15", 0, tt.holdings, tt.weights, 100, tt.bands)
			if got != tt.want {
				t.Errorf("bands=%+v holdings=%v weights=%v => %v, want %v", tt.bands, tt.holdings, tt.weights, got, tt.want)
			}
		})
	}
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

func TestToPricePoints(t *testing.T) {
	nan := math.NaN()
	tests := []struct {
		name string
		in   map[string]float64
		want []PricePoint
	}{
		{"empty map returns nil", map[string]float64{}, nil},
		{"filters NaN/zero/negative", map[string]float64{"2024-01-01": nan, "2024-01-02": 0, "2024-01-04": -10}, nil},
		{"sorts ascending", map[string]float64{"2024-03-01": 100, "2024-01-01": 90}, []PricePoint{{"2024-01-01", 90}, {"2024-03-01", 100}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToPricePoints(tt.in)
			if tt.want == nil {
				if got != nil {
					t.Errorf("want nil, got %v", got)
				}
				return
			}
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %v, want %v", i, got[i], tt.want[i])
				}
			}
		})
	}
}
