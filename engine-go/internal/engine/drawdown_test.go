package engine

import (
	"math"
	"testing"
)

func TestDetectDrawdownEpisodes(t *testing.T) {
	t.Run("insufficient data", func(t *testing.T) {
		curve := []DataPoint{{Date: "2024-01-01", Value: 100}}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 0 {
			t.Errorf("expected 0 episodes, got %d", len(episodes))
		}
	})

	t.Run("monotonic up", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 120},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 0 {
			t.Errorf("expected 0 episodes, got %d", len(episodes))
		}
	})

	t.Run("single drawdown with recovery", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 90},
			{Date: "2024-01-04", Value: 80},
			{Date: "2024-01-05", Value: 110},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		expectedDD := (110.0 - 80.0) / 110.0
		if math.Abs(episodes[0].Depth-expectedDD) > 1e-6 {
			t.Errorf("expected drawdown %v, got %v", expectedDD, episodes[0].Depth)
		}
		if episodes[0].PeakDate != "2024-01-02" {
			t.Errorf("expected peak 2024-01-02, got %s", episodes[0].PeakDate)
		}
		if episodes[0].TroughDate != "2024-01-04" {
			t.Errorf("expected trough 2024-01-04, got %s", episodes[0].TroughDate)
		}
		if episodes[0].RecoveryDate != "2024-01-05" {
			t.Errorf("expected recovery 2024-01-05, got %s", episodes[0].RecoveryDate)
		}
	})

	t.Run("multiple drawdowns", func(t *testing.T) {
		// 100 → 110 → 90 → 110 → 100 → 80 → 105
		// Episode 1: peak=110(day2), trough=90(day3), recovery=110(day4), dd=(110-90)/110=0.1818
		// Episode 2: peak=110(day4), trough=80(day6), recovery=105(day7)... wait, 105 < 110, not recovered
		// Actually: day4=110 (peak), day5=100, day6=80 (trough), day7=105
		// 105 < 110 so still in drawdown at end → unclosed episode
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 90},
			{Date: "2024-01-04", Value: 110},
			{Date: "2024-01-05", Value: 100},
			{Date: "2024-01-06", Value: 80},
			{Date: "2024-01-07", Value: 105},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 2 {
			t.Fatalf("expected 2 episodes, got %d", len(episodes))
		}
		expectedDD1 := (110.0 - 90.0) / 110.0
		if math.Abs(episodes[0].Depth-expectedDD1) > 1e-6 {
			t.Errorf("episode 1 drawdown = %v, want %v", episodes[0].Depth, expectedDD1)
		}
		if episodes[0].RecoveryDate != "2024-01-04" {
			t.Errorf("episode 1 recovery = %s, want 2024-01-04", episodes[0].RecoveryDate)
		}
		expectedDD2 := (110.0 - 80.0) / 110.0
		if math.Abs(episodes[1].Depth-expectedDD2) > 1e-6 {
			t.Errorf("episode 2 drawdown = %v, want %v", episodes[1].Depth, expectedDD2)
		}
		if episodes[1].RecoveryDate != "" {
			t.Errorf("episode 2 should be unclosed, got recovery=%s", episodes[1].RecoveryDate)
		}
	})

	t.Run("drawdown below threshold ignored", func(t *testing.T) {
		// 4% drawdown is below 5% threshold
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 105},
			{Date: "2024-01-03", Value: 101},
			{Date: "2024-01-04", Value: 106},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 0 {
			t.Errorf("expected 0 episodes for sub-threshold drawdown, got %d", len(episodes))
		}
	})

	t.Run("unclosed drawdown at end", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 90},
			{Date: "2024-01-04", Value: 85},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		expectedDD := (110.0 - 85.0) / 110.0
		if math.Abs(episodes[0].Depth-expectedDD) > 1e-6 {
			t.Errorf("drawdown = %v, want %v", episodes[0].Depth, expectedDD)
		}
		if episodes[0].RecoveryDate != "" {
			t.Errorf("expected empty recovery date, got %s", episodes[0].RecoveryDate)
		}
	})

	t.Run("trough updates within drawdown", func(t *testing.T) {
		// peak=110, then 95, then 85 (new trough), then recovery to 110
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 95},
			{Date: "2024-01-04", Value: 85},
			{Date: "2024-01-05", Value: 110},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		expectedDD := (110.0 - 85.0) / 110.0
		if math.Abs(episodes[0].Depth-expectedDD) > 1e-6 {
			t.Errorf("drawdown = %v, want %v (trough updated)", episodes[0].Depth, expectedDD)
		}
		if episodes[0].TroughDate != "2024-01-04" {
			t.Errorf("trough date = %s, want 2024-01-04", episodes[0].TroughDate)
		}
	})
}

func TestComputeDrawdownCurve(t *testing.T) {
	// 从 []DataPoint 提取 values/dates 供 CalcDrawdownCurve 使用
	toCurve := func(points []DataPoint) ([]float64, []string) {
		values := make([]float64, len(points))
		dates := make([]string, len(points))
		for i, p := range points {
			values[i] = p.Value
			dates[i] = p.Date
		}
		return values, dates
	}

	t.Run("empty curve", func(t *testing.T) {
		got := CalcDrawdownCurve(nil, nil)
		if got != nil {
			t.Error("expected nil for empty curve")
		}
	})

	t.Run("monotonic up", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 120},
		}
		vals, dates := toCurve(curve)
		got := CalcDrawdownCurve(vals, dates)
		if len(got) != 3 {
			t.Fatalf("expected 3 points, got %d", len(got))
		}
		for _, p := range got {
			if p.Drawdown != 0 {
				t.Errorf("point %s drawdown = %v, want 0", p.Date, p.Drawdown)
			}
		}
	})

	t.Run("peak and recovery", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 90},
			{Date: "2024-01-03", Value: 110},
		}
		vals, dates := toCurve(curve)
		got := CalcDrawdownCurve(vals, dates)
		if len(got) != 3 {
			t.Fatalf("expected 3 points, got %d", len(got))
		}
		if got[0].Drawdown != 0 {
			t.Errorf("point 0 drawdown = %v, want 0", got[0].Drawdown)
		}
		expectedDD1 := (100.0 - 90.0) / 100.0
		if math.Abs(got[1].Drawdown-expectedDD1) > 1e-6 {
			t.Errorf("point 1 drawdown = %v, want %v", got[1].Drawdown, expectedDD1)
		}
		if got[2].Drawdown != 0 {
			t.Errorf("point 2 (recovery) drawdown = %v, want 0", got[2].Drawdown)
		}
	})

	t.Run("drawdown dates preserved", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 80},
		}
		vals, dates := toCurve(curve)
		got := CalcDrawdownCurve(vals, dates)
		if got[0].Date != "2024-01-01" || got[1].Date != "2024-01-02" {
			t.Errorf("dates not preserved: got %s, %s", got[0].Date, got[1].Date)
		}
	})
}

func TestDaysBetween(t *testing.T) {
	tests := []struct {
		name string
		d1   string
		d2   string
		want int
	}{
		{"same day", "2024-01-01", "2024-01-01", 0},
		{"one day apart", "2024-01-01", "2024-01-02", 1},
		{"ten days", "2024-01-01", "2024-01-11", 10},
		{"year boundary", "2023-12-31", "2024-01-01", 1},
		{"reverse order", "2024-01-11", "2024-01-01", 10},
		{"bad date", "not-a-date", "2024-01-01", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := daysBetween(tt.d1, tt.d2)
			if got != tt.want {
				t.Errorf("daysBetween(%q, %q) = %v, want %v", tt.d1, tt.d2, got, tt.want)
			}
		})
	}
}
