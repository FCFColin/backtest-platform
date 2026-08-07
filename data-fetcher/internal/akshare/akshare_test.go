package akshare

import (
	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
	testutil "data-fetcher/internal/provider/testutil"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func validKline(date, open, close, high, low, vol string) string {
	return date + "," + open + "," + close + "," + high + "," + low + "," + vol + ",100000,1.5,2.5,0.2,3.0"
}
func buildEastMoneyJSON(klines []string, dataNil bool) []byte {
	if dataNil {
		return []byte(`{"data":null}`)
	}
	resp := eastMoneyResponse{
		Data: &struct {
			Code   string   `json:"code"`
			Market int      `json:"market"`
			Name   string   `json:"name"`
			Klines []string `json:"klines"`
		}{
			Code:   "000001",
			Market: 0,
			Name:   "平安银行",
			Klines: klines,
		},
	}
	b, _ := json.Marshal(resp)
	return b
}

type parseDailyInput struct {
	klines  []string
	dataNil bool
}

func TestParseDailyPrices(t *testing.T) {
	wantSuccess := []provider.DailyPrice{
		{Date: "2024-01-02", Open: 10.5, High: 11, Low: 10.3, Close: 10.8, Volume: 1000000, AdjustedClose: 10.8},
		{Date: "2024-01-03", Open: 10.8, High: 11.5, Low: 10.7, Close: 11.2, Volume: 1200000, AdjustedClose: 11.2},
	}
	cases := []testutil.ParseCase[parseDailyInput, []provider.DailyPrice]{
		{Name: "success", In: parseDailyInput{klines: []string{
			validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000"),
			validKline("2024-01-03", "10.8", "11.2", "11.5", "10.7", "1200000"),
		}}, Want: wantSuccess},
		{Name: "nil data", In: parseDailyInput{dataNil: true}, Want: nil, WantErr: true},
		{Name: "empty klines", In: parseDailyInput{}, Want: nil},
		{Name: "short kline skipped", In: parseDailyInput{klines: []string{
			validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000"),
			"2024-01-03,10.8,11.2", // 不足 11 段，应跳过
		}}, Want: wantSuccess[:1]},
		{Name: "empty fields", In: parseDailyInput{klines: []string{"2024-01-02,,,,,1000000,100000,1.5,2.5,0.2,3.0"}}, Want: []provider.DailyPrice{
			{Date: "2024-01-02", Open: 0, High: 0, Low: 0, Close: 0, Volume: 1000000, AdjustedClose: 0},
		}},
	}
	testutil.RunParse(t, cases, func(in parseDailyInput) ([]provider.DailyPrice, error) {
		return parseDailyPrices(buildEastMoneyJSON(in.klines, in.dataNil))
	}, testutil.AssertPricesEqual)
}

func TestParseDailyPrices_MalformedJSON(t *testing.T) {
	_, err := parseDailyPrices([]byte(`{invalid json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParseCodeAndMarket(t *testing.T) {
	cases := []struct {
		ticker     string
		wantCode   string
		wantMarket string
	}{
		{"000001_SZ", "000001", "0"},
		{"600519_SH", "600519", "1"},
		{"000001.SZ", "000001", "0"},
		{"600519.SH", "600519", "1"},
		{"000001_sz", "000001", "0"}, // 小写后缀
	}
	for _, c := range cases {
		code, market := parseCodeAndMarket(c.ticker)
		if code != c.wantCode {
			t.Errorf("parseCodeAndMarket(%q) code = %q, want %q", c.ticker, code, c.wantCode)
		}
		if market != c.wantMarket {
			t.Errorf("parseCodeAndMarket(%q) market = %q, want %q", c.ticker, market, c.wantMarket)
		}
	}
}

func TestNewProvider_Name(t *testing.T) {
	p := NewProvider()
	if p == nil {
		t.Fatal("NewProvider() returned nil")
	}
	if name := p.Name(); name != "akshare" {
		t.Errorf("Name() = %q, want akshare", name)
	}
}

func TestSearchTicker_NotImplemented(t *testing.T) {
	p := NewProvider()
	_, err := p.SearchTicker("test")
	if err == nil {
		t.Fatal("expected error for unimplemented SearchTicker, got nil")
	}
}

func TestDoWithRetry(t *testing.T) {
	orig := base.HTTPClient
	defer func() { base.HTTPClient = orig }()
	base.HTTPClient = httpclient.New("test", httpclient.Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})
	cases := []struct {
		name    string
		handler http.HandlerFunc
		wantErr bool
	}{
		{"http 500", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`internal server error`))
		}, true},
		{"parse error", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":null}`))
		}, true},
		{"success", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(buildEastMoneyJSON([]string{validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000")}, false))
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := httptest.NewServer(c.handler)
			defer ts.Close()
			prices, err := doWithRetry(ts.URL + "/test")
			if c.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(prices) != 1 {
				t.Fatalf("expected 1 price, got %d", len(prices))
			}
		})
	}
}
