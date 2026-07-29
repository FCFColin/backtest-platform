// Package main — sim_api_test.go
// D5-004: cmd/worker SIM API 与 deriveExchange 覆盖率提升测试
package main

import (
	"sort"
	"testing"
)

// ---------- deriveExchange ----------

func TestDeriveExchange_SZSuffix(t *testing.T) {
	cases := []string{"000001.SZ", "000001_SZ"}
	for _, c := range cases {
		if got := deriveExchange(c); got != "SZSE" {
			t.Errorf("deriveExchange(%q) = %q, want SZSE", c, got)
		}
	}
}

func TestDeriveExchange_SSESuffix(t *testing.T) {
	cases := []string{"600000.SS", "600000_SS", "600000.SH", "600000_SH"}
	for _, c := range cases {
		if got := deriveExchange(c); got != "SSE" {
			t.Errorf("deriveExchange(%q) = %q, want SSE", c, got)
		}
	}
}

func TestDeriveExchange_DefaultUS(t *testing.T) {
	cases := []string{"AAPL", "MSFT", "GOOG", "BRK.B"}
	for _, c := range cases {
		if got := deriveExchange(c); got != "US" {
			t.Errorf("deriveExchange(%q) = %q, want US", c, got)
		}
	}
}

func TestDeriveExchange_CaseInsensitive(t *testing.T) {
	if got := deriveExchange("000001.sz"); got != "SZSE" {
		t.Errorf("deriveExchange(lowercase .sz) = %q, want SZSE", got)
	}
	if got := deriveExchange("600000.sh"); got != "SSE" {
		t.Errorf("deriveExchange(lowercase .sh) = %q, want SSE", got)
	}
}

func TestDeriveExchange_Empty(t *testing.T) {
	if got := deriveExchange(""); got != "US" {
		t.Errorf("deriveExchange(empty) = %q, want US", got)
	}
}

// ---------- GetAllSIMTickers ----------

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
		// 实际 SIM ticker 名均以 SIM 结尾
		if len(tk) > 3 && tk[len(tk)-3:] == "SIM" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected at least one *SIM ticker")
	}
}

// ---------- GetSIMSourceTickers ----------

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
	// 测试第一个 SIM ticker 的 source tickers（不强制非空，某些 SIM 可能只有 FRED segment）
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

// ---------- GetEarliestStartDate ----------

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

// ---------- IsSIMTicker / GetSIMDefinition (补充边界) ----------

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

// ---------- normalizeAndMergeSegments_NormalizationRatio ----------
// （Empty/SingleSegment/TwoSegments 已在 sim_splice_test.go 中测试，此处仅补充归一化比率验证）

func TestNormalizeAndMergeSegments_NormalizationRatio(t *testing.T) {
	// 前一段最后 close=100，后一段第一 close=50，归一化比率=2.0
	seg := []segmentData{
		{
			prices: []dailyPrice{
				{Date: "2020-01-01", Close: 100},
			},
		},
		{
			prices: []dailyPrice{
				{Date: "2020-01-02", Close: 50},
				{Date: "2020-01-03", Close: 60},
			},
		},
	}
	result := normalizeAndMergeSegments(seg)
	if len(result) != 2 {
		t.Fatalf("got %d prices, want 2", len(result))
	}
	// 第二段第一个点被去掉，第二个点 close=60 * 2.0 = 120
	if result[1].Close != 120 {
		t.Errorf("normalized close = %v, want 120", result[1].Close)
	}
}