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
	cases := []testutil.ParseCase[string, []provider.DailyPrice]{
		{Name: "success", In: `{
			"chart":{"result":[{
				"timestamp":[1704067200,1704153600],
				"indicators":{
					"quote":[{"open":[100.0,101.0],"high":[105.0,106.0],"low":[99.0,100.0],"close":[103.0,104.0],"volume":[1000000.0,1200000.0]}],
					"adjclose":[{"adjclose":[103.0,104.0]}]
				}
			}],"error":null}
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: testutil.F64(103)},
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: testutil.F64(104)},
		}},
		{Name: "empty result", In: `{"chart":{"result":[],"error":null}}`, Want: nil},
		{Name: "empty timestamp", In: `{"chart":{"result":[{"timestamp":[],"indicators":{"quote":[]}}],"error":null}}`, Want: nil},
		{Name: "api error", In: `{"chart":{"result":[],"error":{"code":"Not Found","description":"No data found"}}}`, Want: nil, WantErr: true},
		{Name: "malformed json", In: `{invalid json`, Want: nil, WantErr: true},
		{Name: "zero close skipped", In: `{
			"chart":{"result":[{
				"timestamp":[1704067200,1704153600],
				"indicators":{"quote":[{"open":[100.0,101.0],"high":[105.0,106.0],"low":[99.0,100.0],"close":[0,104.0],"volume":[1000000.0,1200000.0]}]}
			}],"error":null}
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-02", Open: 101, High: 106, Low: 100, Close: 104, Volume: 1200000, AdjustedClose: testutil.F64(104)},
		}},
		{Name: "no adjclose falls back to close", In: `{
			"chart":{"result":[{
				"timestamp":[1704067200],
				"indicators":{"quote":[{"open":[100.0],"high":[105.0],"low":[99.0],"close":[103.0],"volume":[1000000.0]}]}
			}],"error":null}
		}`, Want: []provider.DailyPrice{
			{Date: "2024-01-01", Open: 100, High: 105, Low: 99, Close: 103, Volume: 1000000, AdjustedClose: testutil.F64(103)},
		}},
	}
	testutil.RunParse(t, cases, func(body string) ([]provider.DailyPrice, error) {
		return parseChartResponse([]byte(body))
	}, testutil.AssertPricesEqual)
}

func TestFetchStockDaily_HTTPError(t *testing.T) {
	orig := base.HTTPClient
	defer func() { base.HTTPClient = orig }()
	base.HTTPClient = testutil.FastFailClient()
	testutil.AssertHTTPError(t, NewProvider(), "INVALID@@@TICKER", "2024-01-01", "2024-01-31")
}
