package engine

// U-2 Phase 2 正向验证：显式 risk_free_rate 生效位移的精确断言。
// legacy 回退（nil→0.02）由 statistics_goldenfile_test.go 字节级锁定保障。

import (
	"math"
	"testing"
)

func TestRiskFreeRateOverride_ShiftsSharpeExactly(t *testing.T) {
	const cagr, stdev = 0.10, 0.20
	legacy := CalcSharpe(cagr, stdev) // rf=0.02
	rf := 0.05
	got := CalcSharpeWithRF(rf, cagr, stdev)
	want := legacy - (rf-0.02)/stdev
	if math.Abs(got-want) > 1e-12 {
		t.Errorf("Sharpe rf 位移 = %v, want %v", got, want)
	}
}

func TestStatisticsRequest_RiskFreeRateFlowsThrough(t *testing.T) {
	rf := 0.05
	req := StatisticsRequest{
		Values:        []float64{100, 105, 110},
		Dates:         []string{"2024-01-01", "2024-01-02", "2024-01-03"},
		StartingValue: 100,
		DailyReturns:  []float64{0.05, 0.0476},
		RiskFreeRate:  &rf,
	}
	st := CalculateStatisticsFromRequest(req)
	rfLegacy := 0.02
	reqNil := req
	reqNil.RiskFreeRate = nil
	stLegacy := CalculateStatisticsFromRequest(reqNil)
	std := statStdevAnnualized(req.DailyReturns)
	wantShift := -(rf - rfLegacy) / std
	if math.Abs(st.Sharpe-stLegacy.Sharpe-wantShift) > 1e-9 {
		t.Errorf("Sharpe 位移 = %v, want %v", st.Sharpe-stLegacy.Sharpe, wantShift)
	}
}

func TestBenchmarkMetricsWithRF_AlphaTreynorM2(t *testing.T) {
	pr := []float64{0.02, 0.04, 0.06}
	br := []float64{0.01, 0.02, 0.03}
	const cagr, benchCagr, beta, benchStd, rf = 0.10, 0.06, 2.0, 0.15, 0.05
	bmRF := computeBenchmarkMetricsWithRF(rf, pr, br, cagr, benchCagr)
	if math.Abs(bmRF.Treynor-(cagr-rf)/beta) > 1e-12 {
		t.Errorf("Treynor = %v", bmRF.Treynor)
	}
	wantAlpha := cagr - (rf + beta*(benchCagr-rf))
	if math.Abs(bmRF.Alpha-wantAlpha) > 1e-12 {
		t.Errorf("Alpha = %v, want %v", bmRF.Alpha, wantAlpha)
	}
	sharpeRF := (cagr - rf) / benchStd
	if math.Abs(bmRF.M2-(sharpeRF*benchStd+rf)) > 1e-12 {
		t.Errorf("M2 = %v", bmRF.M2)
	}
}

func statStdevAnnualized(daily []float64) float64 {
	return CalcAnnualizedStdev(daily)
}
