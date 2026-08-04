package twelvedata

import (
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"os"
	"testing"
)

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	key := os.Getenv("TWELVE_DATA_API_KEY")
	os.Unsetenv("TWELVE_DATA_API_KEY")
	defer func() {
		if key != "" {
			os.Setenv("TWELVE_DATA_API_KEY", key)
		}
	}()
	if p := NewProvider(); p != nil {
		t.Fatal("expected nil provider when TWELVE_DATA_API_KEY not set")
	}
}

func TestNewProvider_WithAPIKey(t *testing.T) {
	os.Setenv("TWELVE_DATA_API_KEY", "test-key")
	defer os.Unsetenv("TWELVE_DATA_API_KEY")
	p := NewProvider()
	if p == nil {
		t.Fatal("expected non-nil provider when TWELVE_DATA_API_KEY set")
	}
	if name := p.Name(); name != "twelvedata" {
		t.Errorf("Name() = %q, want twelvedata", name)
	}
}

func TestSearchTicker_NotImplemented(t *testing.T) {
	os.Setenv("TWELVE_DATA_API_KEY", "test-key")
	defer os.Unsetenv("TWELVE_DATA_API_KEY")
	p := NewProvider()
	if p == nil {
		t.Fatal("provider is nil")
	}
	_, err := p.SearchTicker("test")
	if err == nil {
		t.Fatal("expected error for unimplemented SearchTicker, got nil")
	}
}

func TestParseTimeSeries(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		want    []provider.DailyPrice
		wantErr bool
	}{
		{"success", `{
			"status":"ok",
			"values":[
				{"datetime":"2024-01-02","open":"100.5","high":"105.0","low":"99.0","close":"103.0","volume":"1000000"},
				{"datetime":"2024-01-03","open":"103.0","high":"106.0","low":"102.0","close":"104.5","volume":"1200000"}
			]
		}`, []provider.DailyPrice{
			{Date: "2024-01-02", Open: 100.5, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
			{Date: "2024-01-03", Open: 103, High: 106, Low: 102, Close: 104.5, Volume: 1200000, AdjustedClose: 104.5},
		}, false},
		{"error status", `{"status":"error","message":"API key invalid"}`, nil, true},
		{"error without message", `{"status":"error"}`, nil, true},
		{"abnormal status", `{"status":"unknown"}`, nil, true},
		{"malformed json", `{invalid`, nil, true},
		{"date filter", `{
			"status":"ok",
			"values":[
				{"datetime":"2023-12-31","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-02-01","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
			]
		}`, []provider.DailyPrice{
			{Date: "2024-01-02", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000, AdjustedClose: 103},
		}, false},
		{"zero close skipped", `{
			"status":"ok",
			"values":[
				{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"0","volume":"1000"},
				{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
			]
		}`, []provider.DailyPrice{
			{Date: "2024-01-03", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000, AdjustedClose: 103},
		}, false},
		{"invalid date skipped", `{
			"status":"ok",
			"values":[
				{"datetime":"invalid-date","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"104","volume":"1000"}
			]
		}`, []provider.DailyPrice{
			{Date: "2024-01-03", Open: 100, High: 105, Low: 99, Close: 104, Volume: 1000, AdjustedClose: 104},
		}, false},
		{"empty values", `{"status":"ok","values":[]}`, nil, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prices, err := parseTimeSeries([]byte(c.body), "2024-01-01", "2024-01-31")
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

func TestFetchStockDaily_HTTPError(t *testing.T) {
	os.Setenv("TWELVE_DATA_API_KEY", "test-key")
	defer os.Unsetenv("TWELVE_DATA_API_KEY")
	orig := httpClient
	defer func() { httpClient = orig }()
	httpClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "AAPL", "2024-01-01", "2024-01-31")
}
