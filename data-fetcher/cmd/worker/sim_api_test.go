// Package main — sim_api_test.go
package main

import (
	"sort"
	"testing"
)

func TestGetAllSIMTickers_NonEmpty(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Error("GetAllSIMTickers returned empty list, expected at least one SIM ticker")
	}
}
func TestGetAllSIMTickers_Sorted(t *testing.T) {
	tickers := GetAllSIMTickers()
	if !sort.StringsAreSorted(tickers) {
		t.Error("GetAllSIMTickers should return sorted list")
	}
}
func TestGetAllSIMTickers_NoDuplicates(t *testing.T) {
	tickers := GetAllSIMTickers()
	seen := make(map[string]bool)
	for _, tk := range tickers {
		if seen[tk] {
			t.Errorf("duplicate ticker found: %s", tk)
		}
		seen[tk] = true
	}
}
func TestGetAllSIMTickers_ContainsKnownSIM(t *testing.T) {
	tickers := GetAllSIMTickers()
	found := false
	for _, tk := range tickers {
		if len(tk) > 3 && tk[len(tk)-3:] == "SIM" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected at least one *SIM ticker")
	}
}
func TestGetSIMSourceTickers_InvalidTicker(t *testing.T) {
	result := GetSIMSourceTickers("NONEXISTENT_TICKER")
	if result != nil {
		t.Errorf("GetSIMSourceTickers(invalid) = %v, want nil", result)
	}
}
func TestGetSIMSourceTickers_ValidTicker(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Skip("no SIM tickers available")
	}
	_ = GetSIMSourceTickers(tickers[0])
}
func TestGetSIMSourceTickers_NoDuplicates(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Skip("no SIM tickers available")
	}
	for _, ticker := range tickers {
		result := GetSIMSourceTickers(ticker)
		seen := make(map[string]bool)
		for _, s := range result {
			if seen[s] {
				t.Errorf("duplicate source ticker %s in SIM %s", s, ticker)
			}
			seen[s] = true
		}
	}
}
func TestGetEarliestStartDate_InvalidTicker(t *testing.T) {
	result := GetEarliestStartDate("NONEXISTENT_TICKER")
	if result != "" {
		t.Errorf("GetEarliestStartDate(invalid) = %q, want empty", result)
	}
}
func TestGetEarliestStartDate_ValidTicker(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Skip("no SIM tickers available")
	}
	result := GetEarliestStartDate(tickers[0])
	if result == "" {
		t.Errorf("GetEarliestStartDate(%q) = empty, want non-empty date", tickers[0])
	}
}
func TestGetEarliestStartDate_ReturnsEarliest(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Skip("no SIM tickers available")
	}
	for _, ticker := range tickers {
		result := GetEarliestStartDate(ticker)
		if result == "" {
			continue
		}
		if len(result) != 10 {
			t.Errorf("GetEarliestStartDate(%q) = %q, want YYYY-MM-DD format", ticker, result)
		}
	}
}
func TestIsSIMTicker_Empty(t *testing.T) {
	if IsSIMTicker("") {
		t.Error("IsSIMTicker(empty) = true, want false")
	}
}
func TestGetSIMDefinition_InvalidTicker(t *testing.T) {
	if def := GetSIMDefinition("NONEXISTENT"); def != nil {
		t.Error("GetSIMDefinition(invalid) should return nil")
	}
}
func TestGetSIMDefinition_ValidTicker(t *testing.T) {
	tickers := GetAllSIMTickers()
	if len(tickers) == 0 {
		t.Skip("no SIM tickers available")
	}
	def := GetSIMDefinition(tickers[0])
	if def == nil {
		t.Fatalf("GetSIMDefinition(%q) = nil, want non-nil", tickers[0])
	}
	if def.Ticker != tickers[0] {
		t.Errorf("definition.Ticker = %q, want %q", def.Ticker, tickers[0])
	}
	if len(def.Segments) == 0 {
		t.Error("SIM definition should have at least one segment")
	}
}
func TestNormalizeAndMergeSegments_NormalizationRatio(t *testing.T) {
	seg := []segmentData{
		{prices: []dailyPrice{{Date: "2020-01-01", Close: 100}}},
		{prices: []dailyPrice{{Date: "2020-01-02", Close: 50}, {Date: "2020-01-03", Close: 60}}},
	}
	result := normalizeAndMergeSegments(seg)
	if len(result) != 2 {
		t.Fatalf("got %d prices, want 2", len(result))
	}
	if result[1].Close != 120 {
		t.Errorf("normalized close = %v, want 120", result[1].Close)
	}
}
