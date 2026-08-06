package twelvedata

import (
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"os"
	"testing"
)

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	t.Setenv("TWELVE_DATA_API_KEY", "")
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
	cases := []testutil.ParseCase[string, []provider.DailyPrice]{
		{Name: "success", In: `{
			"status":"ok",
			"values":[
				{"datetime":"2024-01-02","open":"100.5","high":"105.0","low":"99.0","close":"103.0","volume":"1000000"},
				{"datetime":"2024-01-03","open":"103.0","high":"106.0","low":"102.0","close":"104.5","volume":"1200000"}
			]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-02", Open: 100.5, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
			{Date: "2024-01-03", Open: 103, High: 106, Low: 102, Close: 104.5, Volume: 1200000, AdjustedClose: 104.5},
		}},
		{Name: "error status", In: `{"status":"error","message":"API key invalid"}`, Want: nil, WantErr: true},
		{Name: "error without message", In: `{"status":"error"}`, Want: nil, WantErr: true},
		{Name: "abnormal status", In: `{"status":"unknown"}`, Want: nil, WantErr: true},
		{Name: "malformed json", In: `{invalid`, Want: nil, WantErr: true},
		{Name: "date filter", In: `{
			"status":"ok",
			"values":[
				{"datetime":"2023-12-31","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-02-01","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
			]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-02", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000, AdjustedClose: 103},
		}},
		{Name: "zero close skipped", In: `{
			"status":"ok",
			"values":[
				{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"0","volume":"1000"},
				{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
			]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-03", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000, AdjustedClose: 103},
		}},
		{Name: "invalid date skipped", In: `{
			"status":"ok",
			"values":[
				{"datetime":"invalid-date","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
				{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"104","volume":"1000"}
			]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-03", Open: 100, High: 105, Low: 99, Close: 104, Volume: 1000, AdjustedClose: 104},
		}},
		{Name: "empty values", In: `{"status":"ok","values":[]}`, Want: nil},
	}
	testutil.RunParse(t, cases, func(body string) ([]provider.DailyPrice, error) {
		return parseTimeSeries([]byte(body), "2024-01-01", "2024-01-31")
	}, testutil.AssertPricesEqual)
}

func TestFetchStockDaily_HTTPError(t *testing.T) {
	os.Setenv("TWELVE_DATA_API_KEY", "test-key")
	defer os.Unsetenv("TWELVE_DATA_API_KEY")
	orig := base.HTTPClient
	defer func() { base.HTTPClient = orig }()
	base.HTTPClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "AAPL", "2024-01-01", "2024-01-31")
}
