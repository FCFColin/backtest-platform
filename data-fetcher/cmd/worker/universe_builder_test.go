// Package main — universe_builder_test.go
// D5-004: data-fetcher cmd/worker 覆盖率提升测试
package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ---------- parsePipeDelimited ----------

func TestParsePipeDelimited_Basic(t *testing.T) {
	data := []byte("AAPL|Apple Inc|Q|N|N|100|N|N\nMSFT|Microsoft|Q|N|N|100|N|N")
	rows := parsePipeDelimited(data, true)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0][0] != "AAPL" {
		t.Errorf("first row first field = %s, want AAPL", rows[0][0])
	}
}

func TestParsePipeDelimited_SkipHeaders(t *testing.T) {
	data := []byte("Symbol|Security Name|Market Category\nAAPL|Apple Inc|Q")
	rows := parsePipeDelimited(data, true)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row (header skipped), got %d", len(rows))
	}
}

func TestParsePipeDelimited_NoSkipHeaders(t *testing.T) {
	data := []byte("Symbol|Security Name\nAAPL|Apple Inc")
	rows := parsePipeDelimited(data, false)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows (no skip), got %d", len(rows))
	}
}

func TestParsePipeDelimited_EmptyLines(t *testing.T) {
	data := []byte("AAPL|Apple\n\n\nMSFT|Microsoft")
	rows := parsePipeDelimited(data, true)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows (empty lines skipped), got %d", len(rows))
	}
}

func TestParsePipeDelimited_FileCreationLine(t *testing.T) {
	data := []byte("AAPL|Apple\nFile Creation Time: 2024-01-01")
	rows := parsePipeDelimited(data, true)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row (File Creation skipped), got %d", len(rows))
	}
}

func TestParsePipeDelimited_TrimsFields(t *testing.T) {
	data := []byte("AAPL | Apple Inc | Q")
	rows := parsePipeDelimited(data, true)
	if rows[0][0] != "AAPL" {
		t.Errorf("field not trimmed: %q", rows[0][0])
	}
}

func TestParsePipeDelimited_EmptyInput(t *testing.T) {
	rows := parsePipeDelimited([]byte(""), true)
	if len(rows) != 0 {
		t.Errorf("expected 0 rows for empty input, got %d", len(rows))
	}
}

// ---------- parseNASDAQList ----------

func TestParseNASDAQList_Basic(t *testing.T) {
	data := []byte("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nAAPL|Apple Inc|Q|N|N|100|N|N\nSPY|SPDR S&P 500|P|N|N|100|Y|N")
	entries := parseNASDAQList(data)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Ticker != "AAPL" {
		t.Errorf("first Ticker = %s, want AAPL", entries[0].Ticker)
	}
	if entries[0].Category != "US Equity" {
		t.Errorf("first Category = %s, want US Equity", entries[0].Category)
	}
}

func TestParseNASDAQList_ETF(t *testing.T) {
	data := []byte("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nSPY|SPDR S&P 500|P|N|N|100|Y|N")
	entries := parseNASDAQList(data)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Category != "ETF" {
		t.Errorf("ETF Category = %s, want ETF", entries[0].Category)
	}
}

func TestParseNASDAQList_SkipsTestIssues(t *testing.T) {
	data := []byte("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nTEST|Test Stock|Q|Y|N|100|N|N\nAAPL|Apple Inc|Q|N|N|100|N|N")
	entries := parseNASDAQList(data)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry (test issue skipped), got %d", len(entries))
	}
	if entries[0].Ticker != "AAPL" {
		t.Errorf("Ticker = %s, want AAPL", entries[0].Ticker)
	}
}

func TestParseNASDAQList_EmptySymbol(t *testing.T) {
	data := []byte("Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n|Empty Stock|Q|N|N|100|N|N")
	entries := parseNASDAQList(data)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries (empty symbol), got %d", len(entries))
	}
}

// ---------- parseOtherList ----------

func TestParseOtherList_Basic(t *testing.T) {
	data := []byte("BRK.A|Desc|Berkshire Hathaway|BRK.A|N|N|100|BRK.A\nVTI|Desc|Vanguard Total Market|VTI|Y|Y|100|VTI")
	entries := parseOtherList(data)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Ticker != "BRK.A" {
		t.Errorf("first Ticker = %s, want BRK.A", entries[0].Ticker)
	}
}

func TestParseOtherList_ETF(t *testing.T) {
	data := []byte("VTI|Desc|Vanguard Total Market|VTI|Y|Y|100|VTI")
	entries := parseOtherList(data)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Category != "ETF" {
		t.Errorf("ETF Category = %s, want ETF", entries[0].Category)
	}
}

// ---------- mergeAndDedup ----------

func TestMergeAndDedup_Basic(t *testing.T) {
	list1 := []TickerEntry{{Ticker: "AAPL", Name: "Apple"}}
	list2 := []TickerEntry{{Ticker: "MSFT", Name: "Microsoft"}}
	result := mergeAndDedup(list1, list2)
	if len(result) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(result))
	}
}

func TestMergeAndDedup_RemovesDuplicates(t *testing.T) {
	list1 := []TickerEntry{{Ticker: "AAPL", Name: "Apple"}}
	list2 := []TickerEntry{{Ticker: "AAPL", Name: ""}} // duplicate, empty name
	result := mergeAndDedup(list1, list2)
	if len(result) != 1 {
		t.Fatalf("expected 1 entry (deduped), got %d", len(result))
	}
}

func TestMergeAndDedup_FillsEmptyName(t *testing.T) {
	list1 := []TickerEntry{{Ticker: "AAPL", Name: ""}}
	list2 := []TickerEntry{{Ticker: "AAPL", Name: "Apple"}}
	result := mergeAndDedup(list1, list2)
	if len(result) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(result))
	}
	if result[0].Name != "Apple" {
		t.Errorf("Name should be filled from second list, got %q", result[0].Name)
	}
}

func TestMergeAndDedup_CaseInsensitive(t *testing.T) {
	list1 := []TickerEntry{{Ticker: "AAPL", Name: "Apple"}}
	list2 := []TickerEntry{{Ticker: "aapl", Name: "Apple Lower"}}
	result := mergeAndDedup(list1, list2)
	if len(result) != 1 {
		t.Fatalf("expected 1 entry (case insensitive dedup), got %d", len(result))
	}
}

func TestMergeAndDedup_Empty(t *testing.T) {
	result := mergeAndDedup()
	if len(result) != 0 {
		t.Errorf("expected 0 entries, got %d", len(result))
	}
}

// ---------- loadTickersFromFile ----------

func TestLoadTickersFromFile_PipeDelimited(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "tickers.txt")
	os.WriteFile(tmpFile, []byte("AAPL|Apple Inc|US Equity\nMSFT|Microsoft|US Equity"), 0644)

	entries, err := loadTickersFromFile(tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Ticker != "AAPL" {
		t.Errorf("first Ticker = %s, want AAPL", entries[0].Ticker)
	}
}

func TestLoadTickersFromFile_CommaDelimited(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "tickers.csv")
	os.WriteFile(tmpFile, []byte("AAPL,Apple Inc,US Equity"), 0644)

	entries, err := loadTickersFromFile(tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Ticker != "AAPL" {
		t.Errorf("Ticker = %s, want AAPL", entries[0].Ticker)
	}
}

func TestLoadTickersFromFile_PlainTicker(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "tickers.txt")
	os.WriteFile(tmpFile, []byte("AAPL\nMSFT\nGOOG"), 0644)

	entries, err := loadTickersFromFile(tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	for _, e := range entries {
		if e.Category != "Custom" {
			t.Errorf("Category = %s, want Custom", e.Category)
		}
	}
}

func TestLoadTickersFromFile_SkipsComments(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "tickers.txt")
	os.WriteFile(tmpFile, []byte("# This is a comment\nAAPL\n# Another comment\nMSFT"), 0644)

	entries, err := loadTickersFromFile(tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries (comments skipped), got %d", len(entries))
	}
}

func TestLoadTickersFromFile_FileNotFound(t *testing.T) {
	_, err := loadTickersFromFile("/nonexistent/path/tickers.txt")
	if err == nil {
		t.Error("expected error for non-existent file, got nil")
	}
}

func TestLoadTickersFromFile_EmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "empty.txt")
	os.WriteFile(tmpFile, []byte(""), 0644)

	entries, err := loadTickersFromFile(tmpFile)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for empty file, got %d", len(entries))
	}
}

// ---------- TickerEntry struct ----------

func TestTickerEntry_Fields(t *testing.T) {
	e := TickerEntry{Ticker: "AAPL", Name: "Apple Inc", Category: "US Equity", Market: "US"}
	if e.Ticker != "AAPL" {
		t.Errorf("Ticker = %s, want AAPL", e.Ticker)
	}
	if e.Name != "Apple Inc" {
		t.Errorf("Name = %s, want Apple Inc", e.Name)
	}
	if e.Category != "US Equity" {
		t.Errorf("Category = %s, want US Equity", e.Category)
	}
	if e.Market != "US" {
		t.Errorf("Market = %s, want US", e.Market)
	}
}

// ---------- TickerMeta / DefaultETFUniverse ----------

func TestDefaultETFUniverse_NotEmpty(t *testing.T) {
	if len(DefaultETFUniverse) == 0 {
		t.Error("DefaultETFUniverse should not be empty")
	}
}

func TestDefaultETFUniverse_HasValidTickers(t *testing.T) {
	for _, meta := range DefaultETFUniverse {
		if meta.Ticker == "" {
			t.Error("found entry with empty Ticker")
		}
		if meta.Name == "" {
			t.Errorf("ticker %s has empty Name", meta.Ticker)
		}
	}
}

func TestDefaultETFUniverse_ContainsSPY(t *testing.T) {
	found := false
	for _, meta := range DefaultETFUniverse {
		if meta.Ticker == "SPY" {
			found = true
			break
		}
	}
	if !found {
		t.Error("DefaultETFUniverse should contain SPY")
	}
}