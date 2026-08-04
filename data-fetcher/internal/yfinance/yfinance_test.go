package yfinance

import (
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"testing"
)

func TestNewProvider_Name(t *testing.T) {
	p := NewProvider()
	if p == nil {
		t.Fatal("NewProvider() returned nil")
	}
	if name := p.Name(); name != "yfinance" {
		t.Errorf("Name() = %q, want yfinance", name)
	}
}

func TestParseChartResponse(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		want    []provider.DailyPrice
		wantErr bool
	}{
		{"success", `{
			"chart":{"result":[{
				"timestamp":[1704067200,1704153600],
				"indicators":{
					"quote":[{"open":[100.0,101.0],"high":[105.0,106.0],"low":[99.0,100.0],"close":[103.0,104.0],"volume":[1000000.0,1200000.0]}],
					"adjclose":[{"adjclose":[103.0,104.0]}]
				}
			}],"error":null}
		}`, []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
		}, false},
		{"empty result", `{"chart":{"result":[],"error":null}}`, nil, false},
		{"empty timestamp", `{"chart":{"result":[{"timestamp":[],"indicators":{"quote":[]}}],"error":null}}`, nil, false},
		{"api error", `{"chart":{"result":[],"error":{"code":"Not Found","description":"No data found"}}}`, nil, true},
		{"malformed json", `{invalid json`, nil, true},
		{"zero close skipped", `{
			"chart":{"result":[{
				"timestamp":[1704067200,1704153600],
				"indicators":{"quote":[{"open":[100.0,101.0],"high":[105.0,106.0],"low":[99.0,100.0],"close":[0,104.0],"volume":[1000000.0,1200000.0]}]}
			}],"error":null}
		}`, []provider.DailyPrice{
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
		}, false},
		{"no adjclose falls back to close", `{
			"chart":{"result":[{
				"timestamp":[1704067200],
				"indicators":{"quote":[{"open":[100.0],"high":[105.0],"low":[99.0],"close":[103.0],"volume":[1000000.0]}]}
			}],"error":null}
		}`, []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prices, err := parseChartResponse([]byte(c.body))
			if c.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			testutil.AssertPrices(t, prices, c.want...)
		})
	}
}

func TestParseSearchResponse(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		want    []provider.TickerInfo
		wantErr bool
	}{
		{"success", `{
			"quotes":[
				{"symbol":"AAPL","shortname":"Apple Inc","longname":"Apple Inc.","quoteType":"EQUITY","exchange":"Nasdaq"},
				{"symbol":"MSFT","shortname":"","longname":"Microsoft Corporation","quoteType":"EQUITY","exchange":"Nasdaq"}
			]
		}`, []provider.TickerInfo{
			{Ticker: "AAPL", Name: "Apple Inc", Market: "美股"},
			{Ticker: "MSFT", Name: "Microsoft Corporation", Market: "美股"},
		}, false},
		{"empty quotes", `{"quotes":[]}`, nil, false},
		{"malformed json", `{invalid`, nil, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			results, err := parseSearchResponse([]byte(c.body))
			if c.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(results) != len(c.want) {
				t.Fatalf("expected %d results, got %d", len(c.want), len(results))
			}
			for i, w := range c.want {
				if results[i] != w {
					t.Errorf("results[%d] = %+v, want %+v", i, results[i], w)
				}
			}
		})
	}
}

func TestFetchStockDaily_HTTPError(t *testing.T) {
	orig := httpClient
	defer func() { httpClient = orig }()
	httpClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "INVALID@@@TICKER", "2024-01-01", "2024-01-31")
}
