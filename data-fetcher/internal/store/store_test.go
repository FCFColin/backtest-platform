// Package store — store_test.go
// D5-004: data-fetcher 覆盖率提升测试
package store

import (
	"context"
	"testing"
)

func TestFilterPricePointsByDate_Empty(t *testing.T) {
	result := filterPricePointsByDate(nil, "2024-01-01", "2024-12-31")
	if len(result) != 0 {
		t.Errorf("expected 0 results for nil input, got %d", len(result))
	}
	result = filterPricePointsByDate([]PricePoint{}, "2024-01-01", "2024-12-31")
	if len(result) != 0 {
		t.Errorf("expected 0 results for empty input, got %d", len(result))
	}
}

func TestFilterPricePointsByDate_AllInRange(t *testing.T) {
	prices := []PricePoint{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-06-15", Close: 110},
		{Date: "2024-12-31", Close: 120},
	}
	result := filterPricePointsByDate(prices, "2024-01-01", "2024-12-31")
	if len(result) != 3 {
		t.Fatalf("expected 3 results, got %d", len(result))
	}
}

func TestFilterPricePointsByDate_BoundaryDates(t *testing.T) {
	prices := []PricePoint{
		{Date: "2023-12-31", Close: 90},
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-06-15", Close: 110},
		{Date: "2024-12-31", Close: 120},
		{Date: "2025-01-01", Close: 130},
	}
	result := filterPricePointsByDate(prices, "2024-01-01", "2024-12-31")
	if len(result) != 3 {
		t.Fatalf("expected 3 results (boundaries inclusive), got %d", len(result))
	}
	if result[0].Date != "2024-01-01" {
		t.Errorf("first result date = %s, want 2024-01-01", result[0].Date)
	}
	if result[2].Date != "2024-12-31" {
		t.Errorf("last result date = %s, want 2024-12-31", result[2].Date)
	}
}

func TestFilterPricePointsByDate_StartOnly(t *testing.T) {
	prices := []PricePoint{
		{Date: "2023-12-31", Close: 90},
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-06-15", Close: 110},
	}
	result := filterPricePointsByDate(prices, "2024-01-01", "")
	if len(result) != 2 {
		t.Fatalf("expected 2 results (start only), got %d", len(result))
	}
}

func TestFilterPricePointsByDate_EndOnly(t *testing.T) {
	prices := []PricePoint{
		{Date: "2024-01-01", Close: 100},
		{Date: "2024-06-15", Close: 110},
		{Date: "2025-01-01", Close: 130},
	}
	result := filterPricePointsByDate(prices, "", "2024-12-31")
	if len(result) != 2 {
		t.Fatalf("expected 2 results (end only), got %d", len(result))
	}
}

func TestFilterPricePointsByDate_NoBounds(t *testing.T) {
	prices := []PricePoint{
		{Date: "2020-01-01", Close: 50},
		{Date: "2024-06-15", Close: 110},
		{Date: "2025-01-01", Close: 130},
	}
	result := filterPricePointsByDate(prices, "", "")
	if len(result) != 3 {
		t.Fatalf("expected 3 results (no bounds), got %d", len(result))
	}
}

func TestFilterPricePointsByDate_AllOutOfRange(t *testing.T) {
	prices := []PricePoint{
		{Date: "2020-01-01", Close: 50},
		{Date: "2020-06-15", Close: 60},
	}
	result := filterPricePointsByDate(prices, "2024-01-01", "2024-12-31")
	if len(result) != 0 {
		t.Errorf("expected 0 results (all out of range), got %d", len(result))
	}
}

func TestPricePoint_Fields(t *testing.T) {
	p := PricePoint{
		Date:        "2024-01-15",
		Open:        100.5,
		High:        105.0,
		Low:         99.5,
		Close:       103.0,
		AdjClose:    103.0,
		Volume:      1000000,
		Dividend:    0.5,
		SplitFactor: 1.0,
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

// ============================================================
// D5-004: New() 错误路径测试（不需要真实 DB）
// ============================================================

// TestNew_EmptyDatabaseURL 空 DATABASE_URL 应返回错误。
func TestNew_EmptyDatabaseURL(t *testing.T) {
	_, err := New(context.Background(), "", nil)
	if err == nil {
		t.Error("New with empty databaseURL should return error")
	}
}

// TestNew_InvalidDatabaseURL 非法 DATABASE_URL 应返回错误。
func TestNew_InvalidDatabaseURL(t *testing.T) {
	_, err := New(context.Background(), "not-a-valid-url", nil)
	if err == nil {
		t.Error("New with invalid databaseURL should return error")
	}
}

// TestBatchValidateTickers_EmptyInput 空 ticker 列表应直接返回 nil（不触碰 DB）。
// 方法在 len(tickers)==0 时提前返回，不会解引用 nil DataStore。
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