package store

import (
	"context"
	"testing"
)

func TestFilterPricePointsByDate(t *testing.T) {
	cases := []struct {
		name      string
		prices    []PricePoint
		start     string
		end       string
		wantLen   int
		wantFirst string
		wantLast  string
	}{
		{"nil input", nil, "2024-01-01", "2024-12-31", 0, "", ""},
		{"empty input", []PricePoint{}, "2024-01-01", "2024-12-31", 0, "", ""},
		{"all in range", []PricePoint{{Date: "2024-01-01", Close: 100}, {Date: "2024-06-15", Close: 110}, {Date: "2024-12-31", Close: 120}}, "2024-01-01", "2024-12-31", 3, "", ""},
		{"boundary dates inclusive", []PricePoint{{Date: "2023-12-31", Close: 90}, {Date: "2024-01-01", Close: 100}, {Date: "2024-06-15", Close: 110}, {Date: "2024-12-31", Close: 120}, {Date: "2025-01-01", Close: 130}}, "2024-01-01", "2024-12-31", 3, "2024-01-01", "2024-12-31"},
		{"start only", []PricePoint{{Date: "2023-12-31", Close: 90}, {Date: "2024-01-01", Close: 100}, {Date: "2024-06-15", Close: 110}}, "2024-01-01", "", 2, "", ""},
		{"end only", []PricePoint{{Date: "2024-01-01", Close: 100}, {Date: "2024-06-15", Close: 110}, {Date: "2025-01-01", Close: 130}}, "", "2024-12-31", 2, "", ""},
		{"no bounds", []PricePoint{{Date: "2020-01-01", Close: 50}, {Date: "2024-06-15", Close: 110}, {Date: "2025-01-01", Close: 130}}, "", "", 3, "", ""},
		{"all out of range", []PricePoint{{Date: "2020-01-01", Close: 50}, {Date: "2020-06-15", Close: 60}}, "2024-01-01", "2024-12-31", 0, "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			result := filterPricePointsByDate(c.prices, c.start, c.end)
			if len(result) != c.wantLen {
				t.Fatalf("got %d results, want %d", len(result), c.wantLen)
			}
			if c.wantFirst != "" && result[0].Date != c.wantFirst {
				t.Errorf("first date = %s, want %s", result[0].Date, c.wantFirst)
			}
			if c.wantLast != "" && result[len(result)-1].Date != c.wantLast {
				t.Errorf("last date = %s, want %s", result[len(result)-1].Date, c.wantLast)
			}
		})
	}
}
func TestPricePoint_Fields(t *testing.T) {
	p := PricePoint{
		Date: "2024-01-15", Open: 100.5, Volume: 1000000,
	}
	if p.Date != "2024-01-15" {
		t.Errorf("Date = %s, want 2024-01-15", p.Date)
	}
	if p.Open != 100.5 {
		t.Errorf("Open = %v, want 100.5", p.Open)
	}
	if p.Volume != 1000000 {
		t.Errorf("Volume = %d, want 1000000", p.Volume)
	}
}
func TestSearchResult_Fields(t *testing.T) {
	r := SearchResult{Ticker: "AAPL", Name: "Apple Inc", Market: "US"}
	if r.Ticker != "AAPL" {
		t.Errorf("Ticker = %s, want AAPL", r.Ticker)
	}
	if r.Name != "Apple Inc" {
		t.Errorf("Name = %s, want Apple Inc", r.Name)
	}
	if r.Market != "US" {
		t.Errorf("Market = %s, want US", r.Market)
	}
}
func TestNew_EmptyDatabaseURL(t *testing.T) {
	_, err := New(context.Background(), "", nil)
	if err == nil {
		t.Error("New with empty databaseURL should return error")
	}
}
func TestNew_InvalidDatabaseURL(t *testing.T) {
	_, err := New(context.Background(), "not-a-valid-url", nil)
	if err == nil {
		t.Error("New with invalid databaseURL should return error")
	}
}
func TestBatchValidateTickers_EmptyInput(t *testing.T) {
	var ds *DataStore // nil — 安全，因为空输入会提前返回
	valid, invalid, err := ds.BatchValidateTickers(context.Background(), nil)
	if err != nil {
		t.Errorf("expected nil error for empty input, got: %v", err)
	}
	if valid != nil {
		t.Errorf("expected nil valid for empty input, got: %v", valid)
	}
	if invalid != nil {
		t.Errorf("expected nil invalid for empty input, got: %v", invalid)
	}
}
