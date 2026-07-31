// Package main — sim_splice_test.go
package main

import (
	"data-fetcher/internal/provider"
	"testing"
)

func TestSanitizePrices_Empty(t *testing.T) {
	result := sanitizePrices(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(result))
	}
}
func TestSanitizePrices_SwapsHighLow(t *testing.T) {
	prices := []dailyPrice{{Date: "2024-01-01", Open: 100, High: 90, Low: 110, Close: 105, Volume: 1000}}
	result := sanitizePrices(prices)
	if result[0].High < result[0].Low {
		t.Errorf("High (%v) should be >= Low (%v) after sanitize", result[0].High, result[0].Low)
	}
}
func TestSanitizePrices_ClampsOpenClose(t *testing.T) {
	prices := []dailyPrice{{Date: "2024-01-01", Open: 50, High: 100, Low: 80, Close: 60, Volume: 1000}}
	result := sanitizePrices(prices)
	if result[0].Open < result[0].Low {
		t.Errorf("Open (%v) should be >= Low (%v)", result[0].Open, result[0].Low)
	}
	if result[0].Close < result[0].Low {
		t.Errorf("Close (%v) should be >= Low (%v)", result[0].Close, result[0].Low)
	}
}
func TestSanitizePrices_NegativeVolume(t *testing.T) {
	prices := []dailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: -500}}
	result := sanitizePrices(prices)
	if result[0].Volume < 0 {
		t.Errorf("Volume should be >= 0, got %d", result[0].Volume)
	}
}
func TestSanitizePrices_AlreadyValid(t *testing.T) {
	prices := []dailyPrice{{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000}}
	result := sanitizePrices(prices)
	if result[0].High != 110 || result[0].Low != 90 {
		t.Errorf("valid data should be unchanged")
	}
}
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
	prices := []dailyPrice{{Date: "2024-01-01", Close: 100}, {Date: "2024-01-02", Close: 101}}
	result := applyExpenseRatio(prices, 0)
	if result[1].Close != 101 {
		t.Errorf("with zero ratio, price should be unchanged, got %v", result[1].Close)
	}
}
func TestNormalizeAndMergeSegments_Empty(t *testing.T) {
	result := normalizeAndMergeSegments(nil)
	if result != nil {
		t.Errorf("expected nil for empty input, got %v", result)
	}
}
func TestNormalizeAndMergeSegments_SingleSegment(t *testing.T) {
	seg := segmentData{
		seg:    &SIMSegment{Source: "TEST"},
		prices: []dailyPrice{{Date: "2024-01-01", Close: 100}, {Date: "2024-01-02", Close: 101}},
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
		seg:    &SIMSegment{Source: "A"},
		prices: []dailyPrice{{Date: "2024-01-01", Close: 100}, {Date: "2024-01-02", Close: 110}},
	}
	seg2 := segmentData{
		seg:    &SIMSegment{Source: "B"},
		prices: []dailyPrice{{Date: "2024-01-02", Close: 110}, {Date: "2024-01-03", Close: 121}},
	}
	result := normalizeAndMergeSegments([]segmentData{seg1, seg2})
	if len(result) != 3 {
		t.Fatalf("expected 3 results (merged), got %d", len(result))
	}
}
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
