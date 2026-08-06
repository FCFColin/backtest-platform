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
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
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
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: 104},
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
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: 103},
		}},
	}
	testutil.RunParse(t, cases, func(body string) ([]provider.DailyPrice, error) {
		return parseCandleResponse([]byte(body))
	}, testutil.AssertPricesEqual)
}

func TestParseSearchResponse(t *testing.T) {
	cases := []testutil.ParseCase[string, []provider.TickerInfo]{
		{Name: "success", In: `{
			"result":[
				{"symbol":"AAPL","description":"Apple Inc","type":"Common Stock"},
				{"symbol":"MSFT","description":"Microsoft Corp","type":"Common Stock"}
			]
		}`, Want: []provider.TickerInfo{
			{Ticker: "AAPL", Name: "Apple Inc", Market: "美股"},
			{Ticker: "MSFT", Name: "Microsoft Corp", Market: "美股"},
		}},
		{Name: "empty result", In: `{"result":[]}`, Want: nil},
		{Name: "malformed json", In: `{invalid`, Want: nil, WantErr: true},
	}
	testutil.RunParse(t, cases, func(body string) ([]provider.TickerInfo, error) {
		return parseSearchResponse([]byte(body))
	}, testutil.AssertEqual[provider.TickerInfo])
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
