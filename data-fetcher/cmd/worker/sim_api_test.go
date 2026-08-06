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
