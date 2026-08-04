package finnhub

import (
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"os"
	"testing"
)

func TestParseCandleResponse(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		want    []provider.DailyPrice
		wantErr bool
	}{
		{"success", `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[103.0,104.0],
			"v":[1000000.0,1200000.0]
		}`, []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
		}, false},
		{"no data", `{"s":"no_data"}`, nil, false},
		{"error status", `{"s":"error"}`, nil, true},
		{"malformed json", `{invalid`, nil, true},
		{"empty arrays", `{"s":"ok","t":[],"o":[],"h":[],"l":[],"c":[],"v":[]}`, nil, false},
		{"zero close skipped", `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[0,104.0],
			"v":[1000000.0,1200000.0]
		}`, []provider.DailyPrice{
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
		}, false},
		{"short C breaks", `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[103.0],
			"v":[1000000.0,1200000.0]
		}`, []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prices, err := parseCandleResponse([]byte(c.body))
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
			"result":[
				{"symbol":"AAPL","description":"Apple Inc","type":"Common Stock"},
				{"symbol":"MSFT","description":"Microsoft Corp","type":"Common Stock"}
			]
		}`, []provider.TickerInfo{
			{Ticker: "AAPL", Name: "Apple Inc", Market: "美股"},
			{Ticker: "MSFT", Name: "Microsoft Corp", Market: "美股"},
		}, false},
		{"empty result", `{"result":[]}`, nil, false},
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

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	key := os.Getenv("FINNHUB_API_KEY")
	os.Unsetenv("FINNHUB_API_KEY")
	defer func() {
		if key != "" {
			os.Setenv("FINNHUB_API_KEY", key)
		}
	}()
	if p := NewProvider(); p != nil {
		t.Fatal("expected nil provider when FINNHUB_API_KEY not set")
	}
}

func TestNewProvider_WithAPIKey(t *testing.T) {
	os.Setenv("FINNHUB_API_KEY", "test-key")
	defer os.Unsetenv("FINNHUB_API_KEY")
	p := NewProvider()
	if p == nil {
		t.Fatal("expected non-nil provider when FINNHUB_API_KEY set")
	}
	if name := p.Name(); name != "finnhub" {
		t.Errorf("Name() = %q, want finnhub", name)
	}
}

func TestFetchStockDaily_HTTPError(t *testing.T) {
	os.Setenv("FINNHUB_API_KEY", "test-key")
	defer os.Unsetenv("FINNHUB_API_KEY")
	orig := httpClient
	defer func() { httpClient = orig }()
	httpClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "AAPL", "2024-01-01", "2024-01-31")
}
