package dates

import (
	"math"
	"testing"
	"time"
)

func TestParseTradingDatesSorted(t *testing.T) {
	pd := map[string]map[string]float64{
		"SPY": {"2024-03-01": 100, "2024-01-01": 90, "2024-02-01": 95},
	}
	dates, err := ParseTradingDates(pd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 3 {
		t.Fatalf("expected 3 dates, got %d", len(dates))
	}
	for i := 1; i < len(dates); i++ {
		if dates[i].Before(dates[i-1]) {
			t.Errorf("dates not sorted: [%d]=%v before [%d]=%v", i, dates[i], i-1, dates[i-1])
		}
	}
}

func TestParseTradingDatesInvalidDateSkipped(t *testing.T) {
	pd := map[string]map[string]float64{
		"SPY": {"2024-01-01": 100, "not-a-date": 95, "2024-02-01": 110},
	}
	dates, err := ParseTradingDates(pd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 2 {
		t.Errorf("expected 2 valid dates (invalid skipped), got %d", len(dates))
	}
}

func TestParseTradingDatesDeduplicates(t *testing.T) {
	pd := map[string]map[string]float64{
		"A": {"2024-01-01": 100, "2024-02-01": 110},
		"B": {"2024-01-01": 200, "2024-03-01": 210},
	}
	dates, err := ParseTradingDates(pd)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 3 {
		t.Errorf("expected 3 unique dates, got %d", len(dates))
	}
}

func TestParseTradingDatesEmpty(t *testing.T) {
	dates, err := ParseTradingDates(map[string]map[string]float64{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(dates) != 0 {
		t.Errorf("expected 0 dates for empty input, got %d", len(dates))
	}
}

func TestFilterByDateRangeStartOnly(t *testing.T) {
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
	}
	filtered := FilterByDateRange(dates, "2024-02-01", "")
	if len(filtered) != 2 {
		t.Errorf("expected 2 dates after start filter, got %d", len(filtered))
	}
}

func TestFilterByDateRangeEndOnly(t *testing.T) {
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
	}
	filtered := FilterByDateRange(dates, "", "2024-02-01")
	if len(filtered) != 2 {
		t.Errorf("expected 2 dates before end filter, got %d", len(filtered))
	}
}

func TestFilterByDateRangeBothBounds(t *testing.T) {
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 4, 1, 0, 0, 0, 0, time.UTC),
	}
	filtered := FilterByDateRange(dates, "2024-02-01", "2024-03-01")
	if len(filtered) != 2 {
		t.Errorf("expected 2 dates in [2024-02-01, 2024-03-01], got %d", len(filtered))
	}
}

func TestFilterByDateRangeNoBounds(t *testing.T) {
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
	}
	filtered := FilterByDateRange(dates, "", "")
	if len(filtered) != 2 {
		t.Errorf("expected 2 dates (no filter), got %d", len(filtered))
	}
}

func TestFilterByDateRangeBoundaryInclusive(t *testing.T) {
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
	}
	// start=2024-01-01 应包含边界日期
	filtered := FilterByDateRange(dates, "2024-01-01", "2024-01-01")
	if len(filtered) != 1 {
		t.Errorf("expected 1 date on boundary (inclusive), got %d", len(filtered))
	}
}

func TestGetSortedDatesOrdering(t *testing.T) {
	pd := map[string]map[string]float64{
		"A": {"2024-03-01": 1, "2024-01-01": 2},
		"B": {"2024-02-01": 3},
	}
	dates := GetSortedDates(pd, []string{"A", "B"})
	if len(dates) != 3 {
		t.Fatalf("expected 3 dates, got %d", len(dates))
	}
	expected := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
	for i, d := range dates {
		if d != expected[i] {
			t.Errorf("dates[%d] = %s, want %s", i, d, expected[i])
		}
	}
}

func TestGetSortedDatesOnlyListedTickers(t *testing.T) {
	pd := map[string]map[string]float64{
		"A": {"2024-01-01": 1},
		"B": {"2024-02-01": 2},
	}
	dates := GetSortedDates(pd, []string{"A"})
	if len(dates) != 1 {
		t.Errorf("expected 1 date (only ticker A), got %d", len(dates))
	}
}

func TestFilterDateStringsNoBounds(t *testing.T) {
	dates := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
	result := FilterDateStrings(dates, "", "")
	if len(result) != 3 {
		t.Errorf("expected 3 dates (no filter), got %d", len(result))
	}
}

func TestFilterDateStringsStartBound(t *testing.T) {
	dates := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
	result := FilterDateStrings(dates, "2024-02-01", "")
	if len(result) != 2 {
		t.Errorf("expected 2 dates, got %d", len(result))
	}
	if result[0] != "2024-02-01" {
		t.Errorf("result[0] = %s, want 2024-02-01", result[0])
	}
}

func TestFilterDateStringsEndBound(t *testing.T) {
	dates := []string{"2024-01-01", "2024-02-01", "2024-03-01"}
	result := FilterDateStrings(dates, "", "2024-02-01")
	if len(result) != 2 {
		t.Errorf("expected 2 dates, got %d", len(result))
	}
	if result[1] != "2024-02-01" {
		t.Errorf("result[1] = %s, want 2024-02-01", result[1])
	}
}

func TestExtractPricesMissingTicker(t *testing.T) {
	pd := map[string]map[string]float64{"A": {"2024-01-01": 100}}
	dates := []time.Time{time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)}
	prices := ExtractPrices(pd, "NONEXISTENT", dates)
	if len(prices) != 1 {
		t.Fatalf("expected 1 price slot, got %d", len(prices))
	}
	if prices[0] != 0 {
		t.Errorf("expected 0 for missing ticker, got %v", prices[0])
	}
}

func TestExtractPricesFound(t *testing.T) {
	pd := map[string]map[string]float64{"SPY": {"2024-01-01": 100}}
	dates := []time.Time{time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)}
	prices := ExtractPrices(pd, "SPY", dates)
	if prices[0] != 100 {
		t.Errorf("expected 100, got %v", prices[0])
	}
}

func TestExtractPricesFromMapSkipsNaN(t *testing.T) {
	pd := map[string]map[string]float64{
		"X": {"2024-01-01": 100, "2024-01-02": math.NaN(), "2024-01-03": 110},
	}
	dates := []string{"2024-01-01", "2024-01-02", "2024-01-03"}
	prices, priceDates := ExtractPricesFromMap(pd, "X", dates)
	if len(prices) != 2 {
		t.Errorf("expected 2 prices (NaN skipped), got %d", len(prices))
	}
	if len(priceDates) != 2 {
		t.Errorf("expected 2 price dates, got %d", len(priceDates))
	}
}

func TestExtractPricesFromMapSkipsInf(t *testing.T) {
	pd := map[string]map[string]float64{
		"X": {"2024-01-01": 100, "2024-01-02": math.Inf(1), "2024-01-03": 110},
	}
	dates := []string{"2024-01-01", "2024-01-02", "2024-01-03"}
	prices, _ := ExtractPricesFromMap(pd, "X", dates)
	if len(prices) != 2 {
		t.Errorf("expected 2 prices (Inf skipped), got %d", len(prices))
	}
}

func TestExtractPricesFromMapSkipsZeroAndNegative(t *testing.T) {
	pd := map[string]map[string]float64{
		"X": {"2024-01-01": 100, "2024-01-02": 0, "2024-01-03": -5, "2024-01-04": 110},
	}
	dates := []string{"2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"}
	prices, _ := ExtractPricesFromMap(pd, "X", dates)
	if len(prices) != 2 {
		t.Errorf("expected 2 prices (zero/negative skipped), got %d", len(prices))
	}
}

func TestExtractPricesFromMapMissingTicker(t *testing.T) {
	pd := map[string]map[string]float64{"A": {"2024-01-01": 100}}
	dates := []string{"2024-01-01"}
	prices, priceDates := ExtractPricesFromMap(pd, "NONEXISTENT", dates)
	if prices != nil {
		t.Errorf("expected nil prices for missing ticker, got %v", prices)
	}
	if priceDates != nil {
		t.Errorf("expected nil priceDates for missing ticker, got %v", priceDates)
	}
}
