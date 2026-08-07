package main

import (
	"math"
	"reflect"
	"testing"
)

func TestSanitizePrices(t *testing.T) {
	cases := []struct {
		name   string
		prices []dailyPrice
		want   []dailyPrice
	}{
		{"empty", nil, []dailyPrice{}},
		{"swaps high low", []dailyPrice{{Date: "2024-01-01", Open: 100, High: 90, Low: 110, Close: 105, Volume: 1000}}, []dailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: 1000}}},
		{"clamps open close", []dailyPrice{{Date: "2024-01-01", Open: 50, High: 100, Low: 80, Close: 60, Volume: 1000}}, []dailyPrice{{Date: "2024-01-01", Open: 80, High: 100, Low: 80, Close: 80, Volume: 1000}}},
		{"negative volume", []dailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: -500}}, []dailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: 0}}},
		{"already valid", []dailyPrice{{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000}}, []dailyPrice{{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := sanitizePrices(c.prices); !reflect.DeepEqual(got, c.want) {
				t.Errorf("sanitizePrices = %+v, want %+v", got, c.want)
			}
		})
	}
}

func priceRow(closes ...float64) []dailyPrice {
	prices := make([]dailyPrice, len(closes))
	for i, c := range closes {
		prices[i] = dailyPrice{Open: c, High: c, Low: c, Close: c, AdjustedClose: c}
	}
	return prices
}

func TestApplyExpenseRatio(t *testing.T) {
	if got := applyExpenseRatio(nil, 0.001); len(got) != 0 {
		t.Errorf("expected 0 for nil input, got %d", len(got))
	}
	cases := []struct {
		name   string
		closes []float64
		ratio  float64
		want   []float64
	}{
		{"zero ratio unchanged", []float64{100, 101}, 0, []float64{100, 101}},
		{"first price unchanged", []float64{100, 101}, 0.001, []float64{100, 100.999599}},
		{"reduces by daily drag", []float64{100, 101}, 0.252, []float64{100, 100.899}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := applyExpenseRatio(priceRow(c.closes...), c.ratio)
			for i, want := range c.want {
				if math.Abs(got[i].Close-want) > 1e-6 {
					t.Errorf("Close[%d] = %v, want %v", i, got[i].Close, want)
				}
			}
		})
	}
}

func seg(closes ...float64) segmentData {
	prices := make([]dailyPrice, len(closes))
	for i, c := range closes {
		prices[i] = dailyPrice{Close: c}
	}
	return segmentData{seg: &SIMSegment{Source: "S"}, prices: prices}
}

func TestNormalizeAndMergeSegments(t *testing.T) {
	cases := []struct {
		name string
		segs []segmentData
		want []float64
	}{
		{"empty", nil, nil},
		{"single segment", []segmentData{seg(100, 101)}, []float64{100, 101}},
		{"two segments", []segmentData{seg(100, 110), seg(110, 121)}, []float64{100, 110, 121}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := normalizeAndMergeSegments(c.segs)
			if len(got) != len(c.want) {
				t.Fatalf("expected %d results, got %d", len(c.want), len(got))
			}
			for i, want := range c.want {
				if got[i].Close != want {
					t.Errorf("Close[%d] = %v, want %v", i, got[i].Close, want)
				}
			}
		})
	}
}

func TestIsSIMTicker(t *testing.T) {
	for _, ticker := range []string{"IEFSIM", "SPYSIM", "VTISIM", "QQQSIM"} {
		if !IsSIMTicker(ticker) {
			t.Errorf("IsSIMTicker(%q) = false, want true", ticker)
		}
	}
	for _, ticker := range []string{"AAPL", "MSFT", "IEF", "SPY", "", "SIM"} {
		if IsSIMTicker(ticker) {
			t.Errorf("IsSIMTicker(%q) = true, want false", ticker)
		}
	}
}

func TestGetSIMDefinition(t *testing.T) {
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
	if def := GetSIMDefinition("NONEXISTENT"); def != nil {
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
	p := dailyPrice{Date: "2024-01-01"}
	if p.Date != "2024-01-01" {
		t.Errorf("Date = %s, want 2024-01-01", p.Date)
	}
}
