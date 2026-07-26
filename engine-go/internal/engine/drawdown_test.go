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
		// P0-1: 验证 TotalTimeDurationDays 为天数而非年
		if episodes[0].TotalTimeDurationDays != 3 {
			t.Errorf("expected TotalTimeDurationDays=3 (days), got %d", episodes[0].TotalTimeDurationDays)
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
		// P0-1: 验证未恢复回撤的 TotalTimeDurationDays
		if episodes[0].TotalTimeDurationDays != 2 {
			t.Errorf("expected TotalTimeDurationDays=2 (days from peak to end), got %d", episodes[0].TotalTimeDurationDays)
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
		// P0-1: 验证 TotalTimeDurationDays
		if episodes[0].TotalTimeDurationDays != 3 {
			t.Errorf("expected TotalTimeDurationDays=3, got %d", episodes[0].TotalTimeDurationDays)
		}
	})

	// P0-1: 新增测试 - 长期回撤验证天数不会被误当作年
	t.Run("long duration drawdown days not years", func(t *testing.T) {
		// 峰值在 2024-01-01，谷值在 2024-03-01（59天后），恢复在 2024-06-01（152天后）
		// TotalTimeDurationDays 应为 152 天，不应被解释为 152 年
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-02-01", Value: 80},
			{Date: "2024-03-01", Value: 70},
			{Date: "2024-04-01", Value: 75},
			{Date: "2024-05-01", Value: 90},
			{Date: "2024-06-01", Value: 100},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		if episodes[0].TotalTimeDurationDays != 152 {
			t.Errorf("expected TotalTimeDurationDays=152 (days), got %d — must not be interpreted as years", episodes[0].TotalTimeDurationDays)
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

// P0-2: 测试回撤片段衍生字段的正确性
func TestDrawdownEpisodeFields(t *testing.T) {
	t.Run("quick recovery episode", func(t *testing.T) {
		// 峰值=110 (day1), 谷值=99 (day2), 恢复=110 (day3)
		// depth = (110-99)/110 ≈ 0.1 (10%, > 5% threshold)
		// timeToTrough = 1 day, recoveryTime = 1 day, totalTime = 2 days
		// recoveryFactor = 1/1 = 1.0
		// cagrDuring: (110/110)^(365/2) - 1 = 0
		// ulcerDuring: sqrt(mean(dd^2)) where dd values are [0, ~0.1, 0]
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110}, // peak
			{Date: "2024-01-03", Value: 99},  // trough (dd = 10%)
			{Date: "2024-01-04", Value: 110},  // recovery
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		ep := episodes[0]
		if ep.TimeToTrough != 1 {
			t.Errorf("TimeToTrough = %d, want 1", ep.TimeToTrough)
		}
		if ep.RecoveryTime != 1 {
			t.Errorf("RecoveryTime = %d, want 1", ep.RecoveryTime)
		}
		if ep.TotalTimeDurationDays != 2 {
			t.Errorf("TotalTimeDurationDays = %d, want 2", ep.TotalTimeDurationDays)
		}
		if math.Abs(ep.RecoveryFactor-1.0) > 1e-6 {
			t.Errorf("RecoveryFactor = %v, want 1.0", ep.RecoveryFactor)
		}
		if math.Abs(ep.CagrDuring-0.0) > 1e-6 {
			t.Errorf("CagrDuring = %v, want 0 (no net change)", ep.CagrDuring)
		}
		if ep.UlcerDuring <= 0 {
			t.Errorf("UlcerDuring = %v, should be > 0", ep.UlcerDuring)
		}
		if ep.ReturnFromPeakToTrough >= 0 {
			t.Errorf("ReturnFromPeakToTrough = %v, should be negative", ep.ReturnFromPeakToTrough)
		}
		if ep.ReturnFromTroughToRecovery == nil {
			t.Error("ReturnFromTroughToRecovery should not be nil for recovered episode")
		}
	})

	t.Run("unrecovered episode fields", func(t *testing.T) {
		// 峰值=110 (day1), 谷值=85 (day3), no recovery at end
		// recoveryDate = "", recoveryTime = 0, recoveryFactor = 0
		// cagrDuring: from peak to end value
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100},
			{Date: "2024-01-02", Value: 110}, // peak
			{Date: "2024-01-03", Value: 90},
			{Date: "2024-01-04", Value: 85}, // trough, still in drawdown
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		ep := episodes[0]
		if ep.RecoveryDate != "" {
			t.Errorf("RecoveryDate = %q, want empty", ep.RecoveryDate)
		}
		if ep.RecoveryTime != 0 {
			t.Errorf("RecoveryTime = %d, want 0 for unrecovered", ep.RecoveryTime)
		}
		if ep.RecoveryFactor != 0 {
			t.Errorf("RecoveryFactor = %v, want 0 for unrecovered", ep.RecoveryFactor)
		}
		if ep.TotalTimeDurationDays != 2 {
			t.Errorf("TotalTimeDurationDays = %d, want 2", ep.TotalTimeDurationDays)
		}
		// CAGR should be negative (value dropped from 110 to 85)
		if ep.CagrDuring >= 0 {
			t.Errorf("CagrDuring = %v, should be negative for unrecovered drawdown", ep.CagrDuring)
		}
		if ep.UlcerDuring <= 0 {
			t.Errorf("UlcerDuring = %v, should be > 0", ep.UlcerDuring)
		}
		if ep.ReturnFromTroughToRecovery != nil {
			t.Error("ReturnFromTroughToRecovery should be nil for unrecovered episode")
		}
	})

	t.Run("deep long duration episode", func(t *testing.T) {
		// 峰值=120 (2024-01-01), 谷值=60 (2024-04-01), 恢复=120 (2024-10-01)
		// depth = 50%, timeToTrough ≈ 91 days, recoveryTime ≈ 183 days
		// totalTime ≈ 274 days
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 120}, // peak
			{Date: "2024-02-01", Value: 90},
			{Date: "2024-03-01", Value: 70},
			{Date: "2024-04-01", Value: 60},  // trough (50% drawdown)
			{Date: "2024-05-01", Value: 70},
			{Date: "2024-06-01", Value: 80},
			{Date: "2024-07-01", Value: 90},
			{Date: "2024-08-01", Value: 100},
			{Date: "2024-09-01", Value: 110},
			{Date: "2024-10-01", Value: 120}, // recovery
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 1 {
			t.Fatalf("expected 1 episode, got %d", len(episodes))
		}
		ep := episodes[0]
		expectedDepth := (120.0 - 60.0) / 120.0
		if math.Abs(ep.Depth-expectedDepth) > 1e-6 {
			t.Errorf("Depth = %v, want %v", ep.Depth, expectedDepth)
		}
		if ep.TimeToTrough != 91 {
			t.Errorf("TimeToTrough = %d, want 91 (Jan 1 to Apr 1)", ep.TimeToTrough)
		}
		if ep.RecoveryTime != 183 {
			t.Errorf("RecoveryTime = %d, want 183 (Apr 1 to Oct 1)", ep.RecoveryTime)
		}
		if ep.TotalTimeDurationDays != 274 {
			t.Errorf("TotalTimeDurationDays = %d, want 274", ep.TotalTimeDurationDays)
		}
		// Recovery factor should be ~2.0 (183/91)
		expectedRF := 183.0 / 91.0
		if math.Abs(ep.RecoveryFactor-expectedRF) > 0.01 {
			t.Errorf("RecoveryFactor = %v, want ~%v", ep.RecoveryFactor, expectedRF)
		}
		// CAGR should be 0 (recovered to same value)
		if math.Abs(ep.CagrDuring-0.0) > 1e-6 {
			t.Errorf("CagrDuring = %v, want 0 (recovered to same value)", ep.CagrDuring)
		}
		// Ulcer should be substantial for 50% drawdown
		if ep.UlcerDuring < 0.1 {
			t.Errorf("UlcerDuring = %v, should be >= 0.1 for deep drawdown", ep.UlcerDuring)
		}
	})
}
