// Package main — sim_splice_test.go
// D5-004: data-fetcher cmd/worker 覆盖率提升测试
package main

import (
	"math"
	"testing"

	"data-fetcher/internal/provider"
)

// ---------- sanitizePrices ----------

func TestSanitizePrices_Empty(t *testing.T) {
	result := sanitizePrices(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}

func TestSanitizePrices_SwapsHighLow(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 100, High: 90, Low: 110, Close: 105, Volume: 1000},
	}
	result := sanitizePrices(prices)
	if result[0].High < result[0].Low {
		t.Errorf("High (%v) should be >= Low (%v) after sanitize", result[0].High, result[0].Low)
	}
}

func TestSanitizePrices_ClampsOpenClose(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 50, High: 100, Low: 80, Close: 60, Volume: 1000},
	}
	result := sanitizePrices(prices)
	if result[0].Open < result[0].Low {
		t.Errorf("Open (%v) should be >= Low (%v)", result[0].Open, result[0].Low)
	}
	if result[0].Close < result[0].Low {
		t.Errorf("Close (%v) should be >= Low (%v)", result[0].Close, result[0].Low)
	}
}

func TestSanitizePrices_NegativeVolume(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: -500},
	}
	result := sanitizePrices(prices)
	if result[0].Volume < 0 {
		t.Errorf("Volume should be >= 0, got %d", result[0].Volume)
	}
}

func TestSanitizePrices_AlreadyValid(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000},
	}
	result := sanitizePrices(prices)
	if result[0].High != 110 || result[0].Low != 90 {
		t.Errorf("valid data should be unchanged")
	}
}

// ---------- applyExpenseRatio ----------

func TestApplyExpenseRatio_Empty(t *testing.T) {
	result := applyExpenseRatio(nil, 0.001)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}

func TestApplyExpenseRatio_FirstPriceUnchanged(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100, AdjustedClose: 100},
		{Date: "2024-01-02", Close: 101, AdjustedClose: 101},
	}
	result := applyExpenseRatio(prices, 0.001)
	if result[0].Close != 100 {
		t.Errorf("first price should be unchanged, got %v", result[0].Close)
	}
}

func TestApplyExpenseRatio_ReducesPrice(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 100, High: 100, Low: 100, Close: 100, AdjustedClose: 100},
		{Date: "2024-01-02", Open: 101, High: 101, Low: 101, Close: 101, AdjustedClose: 101},
	}
	result := applyExpenseRatio(prices, 0.252) // 25.2% annual = 0.1% daily
	if result[1].Close >= 101 {
		t.Errorf("second price should be reduced by expense ratio, got %v", result[1].Close)
	}
}

func TestApplyExpenseRatio_ZeroRatio(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 101},
	}
	result := applyExpenseRatio(prices, 0)
	if result[1].Close != 101 {
		t.Errorf("with zero ratio, price should be unchanged, got %v", result[1].Close)
	}
}

// ---------- deduplicateByDate ----------

func TestDeduplicateByDate_Empty(t *testing.T) {
	result := deduplicateByDate(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}

func TestDeduplicateByDate_NoDuplicates(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 101},
		{Date: "2024-01-03", Close: 102},
	}
	result := deduplicateByDate(prices)
	if len(result) != 3 {
		t.Errorf("expected 3 results, got %d", len(result))
	}
}

func TestDeduplicateByDate_WithDuplicates(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-02", Close: 101},
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-01", Close: 200}, // duplicate, should overwrite
	}
	result := deduplicateByDate(prices)
	if len(result) != 2 {
		t.Fatalf("expected 2 results, got %d", len(result))
	}
	// Should be sorted by date
	if result[0].Date != "2024-01-01" {
		t.Errorf("first date = %s, want 2024-01-01", result[0].Date)
	}
	// Last occurrence wins
	if result[0].Close != 200 {
		t.Errorf("duplicate Close = %v, want 200 (last wins)", result[0].Close)
	}
}

func TestDeduplicateByDate_Sorted(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-03-01", Close: 300},
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-02-01", Close: 200},
	}
	result := deduplicateByDate(prices)
	if result[0].Date != "2024-01-01" || result[1].Date != "2024-02-01" || result[2].Date != "2024-03-01" {
		t.Errorf("results should be sorted by date")
	}
}

// ---------- normalizeToTotalReturn ----------

func TestNormalizeToTotalReturn_Empty(t *testing.T) {
	result := normalizeToTotalReturn(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}

func TestNormalizeToTotalReturn_FirstIsOne(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 110},
	}
	result := normalizeToTotalReturn(prices)
	if result[0].Close != 1.0 {
		t.Errorf("first Close should be 1.0, got %v", result[0].Close)
	}
}

func TestNormalizeToTotalReturn_Cumulative(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 110}, // +10%
		{Date: "2024-01-03", Close: 121}, // +10%
	}
	result := normalizeToTotalReturn(prices)
	if math.Abs(result[1].Close-1.1) > 1e-6 {
		t.Errorf("second Close = %v, want 1.1", result[1].Close)
	}
	if math.Abs(result[2].Close-1.21) > 1e-6 {
		t.Errorf("third Close = %v, want 1.21", result[2].Close)
	}
}

// ---------- adjustForSplit ----------

func TestAdjustForSplit_NoSplitDate(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 100, High: 100, Low: 100, Close: 100, AdjustedClose: 100},
		{Date: "2024-01-02", Open: 101, High: 101, Low: 101, Close: 101, AdjustedClose: 101},
	}
	result := adjustForSplit(prices, "2025-01-01", 2.0)
	// Split date is after all prices, no adjustment
	if result[0].Close != 100 {
		t.Errorf("Close should be unchanged, got %v", result[0].Close)
	}
}

func TestAdjustForSplit_WithSplit(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Open: 100, High: 100, Low: 100, Close: 100, AdjustedClose: 100},
		{Date: "2024-01-02", Open: 200, High: 200, Low: 200, Close: 200, AdjustedClose: 200},
	}
	result := adjustForSplit(prices, "2024-01-02", 2.0)
	// Before split date: price should be halved
	if result[0].Close != 50 {
		t.Errorf("pre-split Close = %v, want 50", result[0].Close)
	}
	// On/after split date: price unchanged
	if result[1].Close != 200 {
		t.Errorf("split-day Close = %v, want 200", result[1].Close)
	}
}

// ---------- calculateCumulativeReturn ----------

func TestCalculateCumulativeReturn_Empty(t *testing.T) {
	result := calculateCumulativeReturn(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}

func TestCalculateCumulativeReturn_FirstIsZero(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 110},
	}
	result := calculateCumulativeReturn(prices)
	if result[0].Close != 0.0 {
		t.Errorf("first Close should be 0.0, got %v", result[0].Close)
	}
}

func TestCalculateCumulativeReturn_Percentage(t *testing.T) {
	prices := []dailyPrice{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-01-02", Close: 110}, // +10%
		{Date: "2024-01-03", Close: 99},  // -10%
	}
	result := calculateCumulativeReturn(prices)
	if math.Abs(result[1].Close-0.1) > 1e-6 {
		t.Errorf("second return = %v, want 0.1", result[1].Close)
	}
	if math.Abs(result[2].Close-(-0.1)) > 1e-6 {
		t.Errorf("third return = %v, want -0.1", result[2].Close)
	}
}

// ---------- clampValue ----------

func TestClampValue_WithinRange(t *testing.T) {
	if v := clampValue(5, 0, 10); v != 5 {
		t.Errorf("clampValue(5, 0, 10) = %v, want 5", v)
	}
}

func TestClampValue_BelowMin(t *testing.T) {
	if v := clampValue(-1, 0, 10); v != 0 {
		t.Errorf("clampValue(-1, 0, 10) = %v, want 0", v)
	}
}

func TestClampValue_AboveMax(t *testing.T) {
	if v := clampValue(15, 0, 10); v != 10 {
		t.Errorf("clampValue(15, 0, 10) = %v, want 10", v)
	}
}

func TestClampValue_AtBoundaries(t *testing.T) {
	if v := clampValue(0, 0, 10); v != 0 {
		t.Errorf("clampValue(0, 0, 10) = %v, want 0", v)
	}
	if v := clampValue(10, 0, 10); v != 10 {
		t.Errorf("clampValue(10, 0, 10) = %v, want 10", v)
	}
}

// ---------- normalizeAndMergeSegments ----------

func TestNormalizeAndMergeSegments_Empty(t *testing.T) {
	result := normalizeAndMergeSegments(nil)
	if result != nil {
		t.Errorf("expected nil for empty input, got %v", result)
	}
}

func TestNormalizeAndMergeSegments_SingleSegment(t *testing.T) {
	seg := segmentData{
		seg: &SIMSegment{Source: "TEST"},
		prices: []dailyPrice{
			{Date: "2024-01-01", Close: 100},
			{Date: "2024-01-02", Close: 101},
		},
	}
	result := normalizeAndMergeSegments([]segmentData{seg})
	if len(result) != 2 {
		t.Fatalf("expected 2 results, got %d", len(result))
	}
	if result[0].Close != 100 {
		t.Errorf("first Close = %v, want 100", result[0].Close)
	}
}

func TestNormalizeAndMergeSegments_TwoSegments(t *testing.T) {
	seg1 := segmentData{
		seg: &SIMSegment{Source: "A"},
		prices: []dailyPrice{
			{Date: "2024-01-01", Close: 100},
			{Date: "2024-01-02", Close: 110},
		},
	}
	seg2 := segmentData{
		seg: &SIMSegment{Source: "B"},
		prices: []dailyPrice{
			{Date: "2024-01-02", Close: 110},
			{Date: "2024-01-03", Close: 121},
		},
	}
	result := normalizeAndMergeSegments([]segmentData{seg1, seg2})
	if len(result) != 3 {
		t.Fatalf("expected 3 results (merged), got %d", len(result))
	}
}

// ---------- SIM Ticker helpers ----------

func TestIsSIMTicker_Valid(t *testing.T) {
	valid := []string{"IEFSIM", "SPYSIM", "VTISIM", "QQQSIM"}
	for _, ticker := range valid {
		if !IsSIMTicker(ticker) {
			t.Errorf("IsSIMTicker(%q) = false, want true", ticker)
		}
	}
}

func TestIsSIMTicker_Invalid(t *testing.T) {
	invalid := []string{"AAPL", "MSFT", "IEF", "SPY", "", "SIM"}
	for _, ticker := range invalid {
		if IsSIMTicker(ticker) {
			t.Errorf("IsSIMTicker(%q) = true, want false", ticker)
		}
	}
}

func TestGetSIMDefinition_Exists(t *testing.T) {
	def := GetSIMDefinition("IEFSIM")
	if def == nil {
		t.Fatal("GetSIMDefinition(IEFSIM) returned nil")
	}
	if def.Ticker != "IEFSIM" {
		t.Errorf("Ticker = %s, want IEFSIM", def.Ticker)
	}
	if len(def.Segments) == 0 {
		t.Error("IEFSIM should have segments")
	}
}

func TestGetSIMDefinition_NotExists(t *testing.T) {
	def := GetSIMDefinition("NONEXISTENT")
	if def != nil {
		t.Errorf("GetSIMDefinition(NONEXISTENT) should return nil, got %v", def)
	}
}

func TestSimDefinitions_Integrity(t *testing.T) {
	for ticker, def := range simDefinitions {
		if def.Ticker != ticker {
			t.Errorf("definition Ticker (%s) != map key (%s)", def.Ticker, ticker)
		}
		if def.Name == "" {
			t.Errorf("%s has empty Name", ticker)
		}
		if len(def.Segments) == 0 {
			t.Errorf("%s has no segments", ticker)
		}
		for i, seg := range def.Segments {
			if seg.Source == "" {
				t.Errorf("%s segment[%d] has empty Source", ticker, i)
			}
		}
	}
}

// ---------- fetchFREDSegment ----------

func TestFetchFREDSegment_ReturnsError(t *testing.T) {
	_, err := fetchFREDSegment("DGS10", "2024-01-01", "2024-12-31", "")
	if err == nil {
		t.Error("fetchFREDSegment should return error (not implemented)")
	}
}

// ---------- provider.DailyPrice type alias ----------

func TestDailyPriceTypeAlias(t *testing.T) {
	var p dailyPrice = provider.DailyPrice{
		Date:   "2024-01-01",
		Close:  100,
		Volume: 1000,
	}
	if p.Date != "2024-01-01" {
		t.Errorf("Date = %s, want 2024-01-01", p.Date)
	}
}