package engine

import (
	"math"
	"testing"
)

func TestDetectDrawdownEpisodes(t *testing.T) {
	for _, tc := range []struct {
		name  string
		curve []DataPoint
	}{
		{"insufficient data", []DataPoint{{Date: "2024-01-01", Value: 100}}},
		{"monotonic up", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 120}}},
		{"drawdown below threshold ignored", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 105}, {Date: "2024-01-03", Value: 101}, {Date: "2024-01-04", Value: 106}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := detectDrawdownEpisodes(tc.curve); len(got) != 0 {
				t.Errorf("expected 0 episodes, got %d", len(got))
			}
		})
	}
	for _, tc := range []struct {
		name          string
		curve         []DataPoint
		depth         float64
		peakDate      string
		troughDate    string
		recoveryDate  string
		checkRecovery bool
		totalDays     int
	}{
		{"single drawdown with recovery", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 90}, {Date: "2024-01-04", Value: 80}, {Date: "2024-01-05", Value: 110}}, (110.0 - 80.0) / 110.0, "2024-01-02", "2024-01-04", "2024-01-05", true, 3},
		{"unclosed drawdown at end", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 90}, {Date: "2024-01-04", Value: 85}}, (110.0 - 85.0) / 110.0, "", "", "", true, 2},
		{"trough updates within drawdown", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 95}, {Date: "2024-01-04", Value: 85}, {Date: "2024-01-05", Value: 110}}, (110.0 - 85.0) / 110.0, "", "2024-01-04", "", false, 3},
		{"long duration drawdown days not years", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-02-01", Value: 80}, {Date: "2024-03-01", Value: 70}, {Date: "2024-04-01", Value: 75}, {Date: "2024-05-01", Value: 90}, {Date: "2024-06-01", Value: 100}}, 0, "", "", "", false, 152},
	} {
		t.Run(tc.name, func(t *testing.T) {
			episodes := detectDrawdownEpisodes(tc.curve)
			if len(episodes) != 1 {
				t.Fatalf("expected 1 episode, got %d", len(episodes))
			}
			ep := episodes[0]
			if tc.depth != 0 {
				assertFloatApprox(t, ep.Depth, tc.depth, "depth", 1e-6)
			}
			if tc.peakDate != "" {
				assertStr(t, ep.PeakDate, tc.peakDate, "peakDate")
			}
			if tc.troughDate != "" {
				assertStr(t, ep.TroughDate, tc.troughDate, "troughDate")
			}
			if tc.checkRecovery {
				assertStr(t, ep.RecoveryDate, tc.recoveryDate, "recoveryDate")
			}
			if tc.totalDays != 0 {
				assertInt(t, ep.TotalTimeDurationDays, tc.totalDays, "totalTimeDurationDays")
			}
		})
	}
	t.Run("multiple drawdowns", func(t *testing.T) {
		curve := []DataPoint{
			{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110},
			{Date: "2024-01-03", Value: 90}, {Date: "2024-01-04", Value: 110},
			{Date: "2024-01-05", Value: 100}, {Date: "2024-01-06", Value: 80},
			{Date: "2024-01-07", Value: 105},
		}
		episodes := detectDrawdownEpisodes(curve)
		if len(episodes) != 2 {
			t.Fatalf("expected 2 episodes, got %d", len(episodes))
		}
		assertFloatApprox(t, episodes[0].Depth, (110.0-90.0)/110.0, "episode 1 depth", 1e-6)
		assertStr(t, episodes[0].RecoveryDate, "2024-01-04", "episode 1 recovery")
		assertFloatApprox(t, episodes[1].Depth, (110.0-80.0)/110.0, "episode 2 depth", 1e-6)
		assertStr(t, episodes[1].RecoveryDate, "", "episode 2 recovery")
	})
}
func TestComputeDrawdownCurve(t *testing.T) {
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
		if got := CalcDrawdownCurve(nil, nil); got != nil {
			t.Error("expected nil for empty curve")
		}
	})
	cases := []struct {
		name  string
		curve []DataPoint
		check func(*testing.T, []DrawdownPoint)
	}{
		{"monotonic up", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 120}}, func(t *testing.T, got []DrawdownPoint) {
			if len(got) != 3 {
				t.Fatalf("expected 3 points, got %d", len(got))
			}
			for _, p := range got {
				if p.Drawdown != 0 {
					t.Errorf("point %s drawdown = %v, want 0", p.Date, p.Drawdown)
				}
			}
		}},
		{"peak and recovery", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 90}, {Date: "2024-01-03", Value: 110}}, func(t *testing.T, got []DrawdownPoint) {
			if len(got) != 3 {
				t.Fatalf("expected 3 points, got %d", len(got))
			}
			if got[0].Drawdown != 0 {
				t.Errorf("point 0 drawdown = %v, want 0", got[0].Drawdown)
			}
			assertFloatApprox(t, got[1].Drawdown, (100.0-90.0)/100.0, "point 1 drawdown", 1e-6)
			if got[2].Drawdown != 0 {
				t.Errorf("point 2 (recovery) drawdown = %v, want 0", got[2].Drawdown)
			}
		}},
		{"drawdown dates preserved", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 80}}, func(t *testing.T, got []DrawdownPoint) {
			if got[0].Date != "2024-01-01" || got[1].Date != "2024-01-02" {
				t.Errorf("dates not preserved: got %s, %s", got[0].Date, got[1].Date)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) { vals, dates := toCurve(tc.curve); tc.check(t, CalcDrawdownCurve(vals, dates)) })
	}
}
func TestDaysBetween(t *testing.T) {
	for _, tt := range []struct {
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
	} {
		t.Run(tt.name, func(t *testing.T) { assertInt(t, daysBetween(tt.d1, tt.d2), tt.want, "daysBetween") })
	}
}
func TestDrawdownEpisodeFields(t *testing.T) {
	for _, c := range []struct {
		name  string
		curve []DataPoint
		check func(*testing.T, DrawdownEpisode)
	}{
		{"quick recovery episode", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 99}, {Date: "2024-01-04", Value: 110}}, func(t *testing.T, ep DrawdownEpisode) {
			assertInt(t, ep.TimeToTrough, 1, "TimeToTrough")
			assertInt(t, ep.RecoveryTime, 1, "RecoveryTime")
			assertInt(t, ep.TotalTimeDurationDays, 2, "TotalTimeDurationDays")
			assertFloatApprox(t, ep.RecoveryFactor, 1.0, "RecoveryFactor", 1e-6)
			assertFloatApprox(t, ep.CagrDuring, 0.0, "CagrDuring", 1e-6)
			if ep.UlcerDuring <= 0 {
				t.Errorf("UlcerDuring = %v, should be > 0", ep.UlcerDuring)
			}
			if ep.ReturnFromPeakToTrough >= 0 {
				t.Errorf("ReturnFromPeakToTrough = %v, should be negative", ep.ReturnFromPeakToTrough)
			}
			if ep.ReturnFromTroughToRecovery == nil {
				t.Error("ReturnFromTroughToRecovery should not be nil for recovered episode")
			}
		}},
		{"unrecovered episode fields", []DataPoint{{Date: "2024-01-01", Value: 100}, {Date: "2024-01-02", Value: 110}, {Date: "2024-01-03", Value: 90}, {Date: "2024-01-04", Value: 85}}, func(t *testing.T, ep DrawdownEpisode) {
			assertStr(t, ep.RecoveryDate, "", "RecoveryDate")
			assertInt(t, ep.RecoveryTime, 0, "RecoveryTime")
			assertFloatApprox(t, ep.RecoveryFactor, 0, "RecoveryFactor", 1e-6)
			assertInt(t, ep.TotalTimeDurationDays, 2, "TotalTimeDurationDays")
			if ep.CagrDuring >= 0 {
				t.Errorf("CagrDuring = %v, should be negative for unrecovered drawdown", ep.CagrDuring)
			}
			if ep.UlcerDuring <= 0 {
				t.Errorf("UlcerDuring = %v, should be > 0", ep.UlcerDuring)
			}
			if ep.ReturnFromTroughToRecovery != nil {
				t.Error("ReturnFromTroughToRecovery should be nil for unrecovered episode")
			}
		}},
		{"deep long duration episode", []DataPoint{{Date: "2024-01-01", Value: 120}, {Date: "2024-02-01", Value: 90}, {Date: "2024-03-01", Value: 70}, {Date: "2024-04-01", Value: 60}, {Date: "2024-05-01", Value: 70}, {Date: "2024-06-01", Value: 80}, {Date: "2024-07-01", Value: 90}, {Date: "2024-08-01", Value: 100}, {Date: "2024-09-01", Value: 110}, {Date: "2024-10-01", Value: 120}}, func(t *testing.T, ep DrawdownEpisode) {
			assertFloatApprox(t, ep.Depth, (120.0-60.0)/120.0, "Depth", 1e-6)
			assertInt(t, ep.TimeToTrough, 91, "TimeToTrough")
			assertInt(t, ep.RecoveryTime, 183, "RecoveryTime")
			assertInt(t, ep.TotalTimeDurationDays, 274, "TotalTimeDurationDays")
			if math.Abs(ep.RecoveryFactor-183.0/91.0) > 0.01 {
				t.Errorf("RecoveryFactor = %v, want ~%v", ep.RecoveryFactor, 183.0/91.0)
			}
			assertFloatApprox(t, ep.CagrDuring, 0.0, "CagrDuring", 1e-6)
			if ep.UlcerDuring < 0.1 {
				t.Errorf("UlcerDuring = %v, should be >= 0.1 for deep drawdown", ep.UlcerDuring)
			}
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			episodes := detectDrawdownEpisodes(c.curve)
			if len(episodes) != 1 {
				t.Fatalf("expected 1 episode, got %d", len(episodes))
			}
			c.check(t, episodes[0])
		})
	}
}
