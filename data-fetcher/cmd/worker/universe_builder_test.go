// Package main — universe_builder_test.go
package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParsePipeDelimited(t *testing.T) {
	for _, tc := range []struct {
		name, input string
		skip        bool
		wantN       int
		want0       string
	}{
		{"basic", "AAPL|Apple Inc|Q|N|N|100|N|N\nMSFT|Microsoft|Q|N|N|100|N|N", true, 2, "AAPL"},
		{"skip headers", "Symbol|Security Name|Market Category\nAAPL|Apple Inc|Q", true, 1, "AAPL"},
		{"no skip", "Symbol|Security Name\nAAPL|Apple Inc", false, 2, ""},
		{"empty lines", "AAPL|Apple\n\n\nMSFT|Microsoft", true, 2, "AAPL"},
		{"file creation line", "AAPL|Apple\nFile Creation Time: 2024-01-01", true, 1, "AAPL"},
		{"trims fields", "AAPL | Apple Inc | Q", true, 1, "AAPL"},
		{"empty input", "", true, 0, ""},
	} {
		rows := parsePipeDelimited([]byte(tc.input), tc.skip)
		if len(rows) != tc.wantN {
			t.Errorf("%s: len=%d want %d", tc.name, len(rows), tc.wantN)
		}
		if tc.want0 != "" && len(rows) > 0 && rows[0][0] != tc.want0 {
			t.Errorf("%s: rows[0][0]=%q want %q", tc.name, rows[0][0], tc.want0)
		}
	}
}

func TestParseNASDAQList(t *testing.T) {
	header := "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\n"
	for _, tc := range []struct {
		name, input string
		wantN       int
		want0       string
		wantCat     string
	}{
		{"basic", header + "AAPL|Apple Inc|Q|N|N|100|N|N\nSPY|SPDR S&P 500|P|N|N|100|Y|N", 2, "AAPL", "US Equity"},
		{"etf", header + "SPY|SPDR S&P 500|P|N|N|100|Y|N", 1, "SPY", "ETF"},
		{"skips test issues", header + "TEST|Test Stock|Q|Y|N|100|N|N\nAAPL|Apple Inc|Q|N|N|100|N|N", 1, "AAPL", ""},
		{"empty symbol", header + "|Empty Stock|Q|N|N|100|N|N", 0, "", ""},
	} {
		entries := parseNASDAQList([]byte(tc.input))
		if len(entries) != tc.wantN {
			t.Errorf("%s: len=%d want %d", tc.name, len(entries), tc.wantN)
		}
		if len(entries) > 0 {
			if tc.want0 != "" && entries[0].Ticker != tc.want0 {
				t.Errorf("%s: Ticker=%q want %q", tc.name, entries[0].Ticker, tc.want0)
			}
			if tc.wantCat != "" && entries[0].Category != tc.wantCat {
				t.Errorf("%s: Category=%q want %q", tc.name, entries[0].Category, tc.wantCat)
			}
		}
	}
}

func TestParseOtherList(t *testing.T) {
	for _, tc := range []struct {
		name, input string
		wantN       int
		want0       string
		wantCat     string
	}{
		{"basic", "BRK.A|Desc|Berkshire Hathaway|BRK.A|N|N|100|BRK.A\nVTI|Desc|Vanguard Total Market|VTI|Y|Y|100|VTI", 2, "BRK.A", ""},
		{"etf", "VTI|Desc|Vanguard Total Market|VTI|Y|Y|100|VTI", 1, "VTI", "ETF"},
	} {
		entries := parseOtherList([]byte(tc.input))
		if len(entries) != tc.wantN {
			t.Errorf("%s: len=%d want %d", tc.name, len(entries), tc.wantN)
		}
		if len(entries) > 0 {
			if tc.want0 != "" && entries[0].Ticker != tc.want0 {
				t.Errorf("%s: Ticker=%q want %q", tc.name, entries[0].Ticker, tc.want0)
			}
			if tc.wantCat != "" && entries[0].Category != tc.wantCat {
				t.Errorf("%s: Category=%q want %q", tc.name, entries[0].Category, tc.wantCat)
			}
		}
	}
}

func TestMergeAndDedup(t *testing.T) {
	for _, tc := range []struct {
		name     string
		lists    [][]TickerEntry
		wantN    int
		wantName string
	}{
		{"basic", [][]TickerEntry{{{Ticker: "AAPL", Name: "Apple"}}, {{Ticker: "MSFT", Name: "Microsoft"}}}, 2, ""},
		{"removes duplicates", [][]TickerEntry{{{Ticker: "AAPL", Name: "Apple"}}, {{Ticker: "AAPL", Name: ""}}}, 1, ""},
		{"fills empty name", [][]TickerEntry{{{Ticker: "AAPL", Name: ""}}, {{Ticker: "AAPL", Name: "Apple"}}}, 1, "Apple"},
		{"case insensitive", [][]TickerEntry{{{Ticker: "AAPL", Name: "Apple"}}, {{Ticker: "aapl", Name: "Apple Lower"}}}, 1, ""},
		{"empty", nil, 0, ""},
	} {
		result := mergeAndDedup(tc.lists...)
		if len(result) != tc.wantN {
			t.Errorf("%s: len=%d want %d", tc.name, len(result), tc.wantN)
		}
		if tc.wantName != "" && len(result) > 0 && result[0].Name != tc.wantName {
			t.Errorf("%s: Name=%q want %q", tc.name, result[0].Name, tc.wantName)
		}
	}
}

func TestLoadTickersFromFile(t *testing.T) {
	for _, tc := range []struct {
		name, content string
		wantN         int
		wantCat       string
	}{
		{"pipe delimited", "AAPL|Apple Inc|US Equity\nMSFT|Microsoft|US Equity", 2, ""},
		{"comma delimited", "AAPL,Apple Inc,US Equity", 1, ""},
		{"plain ticker", "AAPL\nMSFT\nGOOG", 3, "Custom"},
		{"skips comments", "# This is a comment\nAAPL\n# Another comment\nMSFT", 2, ""},
		{"empty file", "", 0, ""},
	} {
		tmpFile := filepath.Join(t.TempDir(), "tickers.txt")
		if err := os.WriteFile(tmpFile, []byte(tc.content), 0o600); err != nil {
			t.Fatal(err)
		}
		entries, err := loadTickersFromFile(tmpFile)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", tc.name, err)
		}
		if len(entries) != tc.wantN {
			t.Errorf("%s: len=%d want %d", tc.name, len(entries), tc.wantN)
		}
		if tc.wantCat != "" {
			for i, e := range entries {
				if e.Category != tc.wantCat {
					t.Errorf("%s: entries[%d].Category=%q want %q", tc.name, i, e.Category, tc.wantCat)
				}
			}
		}
	}
}

func TestLoadTickersFromFile_FileNotFound(t *testing.T) {
	if _, err := loadTickersFromFile("/nonexistent/path/tickers.txt"); err == nil {
		t.Error("expected error for non-existent file, got nil")
	}
}

func TestDefaultETFUniverse(t *testing.T) {
	if len(DefaultETFUniverse) == 0 {
		t.Fatal("should not be empty")
	}
	foundSPY := false
	for _, meta := range DefaultETFUniverse {
		if meta.Ticker == "" || meta.Name == "" {
			t.Errorf("entry has empty Ticker/Name: %+v", meta)
		}
		if meta.Ticker == "SPY" {
			foundSPY = true
		}
	}
	if !foundSPY {
		t.Error("should contain SPY")
	}
}

func TestDefaultWorkerConfig(t *testing.T) {
	os.Unsetenv("DATABASE_URL")
	if cfg := defaultWorkerConfig(); cfg == nil || cfg.DatabaseURL != "" {
		t.Errorf("nil=%v want empty URL", cfg == nil)
	}
	os.Setenv("DATABASE_URL", "  postgres://localhost/worker  ")
	defer os.Unsetenv("DATABASE_URL")
	if cfg := defaultWorkerConfig(); cfg == nil || cfg.DatabaseURL != "postgres://localhost/worker" {
		t.Errorf("nil=%v want trimmed URL", cfg == nil)
	}
}
