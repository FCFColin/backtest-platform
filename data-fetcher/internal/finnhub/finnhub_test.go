package finnhub

import (
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"os"
	"testing"
)

func TestParseCandleResponse(t *testing.T) {
	cases := []testutil.ParseCase[string, []provider.DailyPrice]{
		{Name: "success", In: `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[103.0,104.0],
			"v":[1000000.0,1200000.0]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000},
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000},
		}},
		{Name: "no data", In: `{"s":"no_data"}`, Want: nil},
		{Name: "error status", In: `{"s":"error"}`, Want: nil, WantErr: true},
		{Name: "malformed json", In: `{invalid`, Want: nil, WantErr: true},
		{Name: "empty arrays", In: `{"s":"ok","t":[],"o":[],"h":[],"l":[],"c":[],"v":[]}`, Want: nil},
		{Name: "zero close skipped", In: `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[0,104.0],
			"v":[1000000.0,1200000.0]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000},
		}},
		{Name: "short C breaks", In: `{
			"s":"ok",
			"t":[1704067200,1704153600],
			"o":[100.0,101.0],
			"h":[105.0,106.0],
			"l":[99.0,100.0],
			"c":[103.0],
			"v":[1000000.0,1200000.0]
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000},
		}},
	}
	testutil.RunParse(t, cases, func(body string) ([]provider.DailyPrice, error) {
		return parseCandleResponse([]byte(body))
	}, testutil.AssertPricesEqual)
}

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	t.Setenv("FINNHUB_API_KEY", "")
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
	orig := base.HTTPClient
	defer func() { base.HTTPClient = orig }()
	base.HTTPClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "AAPL", "2024-01-01", "2024-01-31")
}
