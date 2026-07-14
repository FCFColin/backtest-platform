package yfinance

import (
	"strconv"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
)

func TestDateToUnix_Valid(t *testing.T) {
	// 2024-01-01 00:00:00 UTC = 1704067200
	ts, err := dateToUnix("2024-01-01")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts != 1704067200 {
		t.Errorf("dateToUnix(\"2024-01-01\") = %d, want 1704067200", ts)
	}
}

func TestDateToUnix_Invalid(t *testing.T) {
	_, err := dateToUnix("invalid-date")
	if err == nil {
		t.Fatal("expected error for invalid date, got nil")
	}
}

func TestToFloat64(t *testing.T) {
	cases := []struct {
		name  string
		input interface{}
		want  float64
	}{
		{"nil", nil, 0},
		{"float64", 3.14, 3.14},
		{"string numeric", "42.5", 42.5},
		{"string invalid", "invalid", 0},
		{"int", 42, 0}, // 非 float64/string 返回 0
	}
	for _, c := range cases {
		got := toFloat64(c.input)
		if got != c.want {
			t.Errorf("toFloat64(%s) = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestToFloat64Safe(t *testing.T) {
	arr := []interface{}{1.5, "2.5", nil, "invalid"}
	if v := toFloat64Safe(arr, 0); v != 1.5 {
		t.Errorf("toFloat64Safe([0]) = %v, want 1.5", v)
	}
	if v := toFloat64Safe(arr, 1); v != 2.5 {
		t.Errorf("toFloat64Safe([1]) = %v, want 2.5", v)
	}
	if v := toFloat64Safe(arr, 2); v != 0 {
		t.Errorf("toFloat64Safe([2] nil) = %v, want 0", v)
	}
	// 越界
	if v := toFloat64Safe(arr, 10); v != 0 {
		t.Errorf("toFloat64Safe(out of range) = %v, want 0", v)
	}
}

func TestToInt64Safe(t *testing.T) {
	arr := []interface{}{42.0, "100", nil, "invalid"}
	if v := toInt64Safe(arr, 0); v != 42 {
		t.Errorf("toInt64Safe([0]) = %d, want 42", v)
	}
	if v := toInt64Safe(arr, 1); v != 100 {
		t.Errorf("toInt64Safe([1]) = %d, want 100", v)
	}
	if v := toInt64Safe(arr, 2); v != 0 {
		t.Errorf("toInt64Safe([2] nil) = %d, want 0", v)
	}
	// 越界
	if v := toInt64Safe(arr, 10); v != 0 {
		t.Errorf("toInt64Safe(out of range) = %d, want 0", v)
	}
}

func TestNewProvider_Name(t *testing.T) {
	p := NewProvider()
	if p == nil {
		t.Fatal("NewProvider() returned nil")
	}
	if name := p.Name(); name != "yfinance" {
		t.Errorf("Name() = %q, want yfinance", name)
	}
}

func TestParseChartResponse_Success(t *testing.T) {
	// 构造 Yahoo Finance chart 响应（timestamp + indicators）
	ts1 := int64(1704067200) // 2024-01-01
	ts2 := int64(1704153600) // 2024-01-02
	body := []byte(`{
		"chart":{
			"result":[{
				"meta":{"currency":"USD","symbol":"AAPL","regularMarketPrice":185.0,"chartPreviousClose":184.0},
				"timestamp":[` + strconv.FormatInt(ts1, 10) + `,` + strconv.FormatInt(ts2, 10) + `],
				"indicators":{
					"quote":[{
						"open":[100.0, 101.0],
						"high":[105.0, 106.0],
						"low":[99.0, 100.0],
						"close":[103.0, 104.0],
						"volume":[1000000.0, 1200000.0]
					}],
					"adjclose":[{"adjclose":[103.0, 104.0]}]
				}
			}],
			"error":null
		}
	}`)

	prices, err := parseChartResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 2 {
		t.Fatalf("expected 2 prices, got %d", len(prices))
	}

	p := prices[0]
	if p.Date != "2024-01-01" {
		t.Errorf("Date = %q, want 2024-01-01", p.Date)
	}
	if p.Open != 100.0 {
		t.Errorf("Open = %v, want 100.0", p.Open)
	}
	if p.Close != 103.0 {
		t.Errorf("Close = %v, want 103.0", p.Close)
	}
	if p.Volume != 1000000 {
		t.Errorf("Volume = %d, want 1000000", p.Volume)
	}
	if p.AdjustedClose != 103.0 {
		t.Errorf("AdjustedClose = %v, want 103.0", p.AdjustedClose)
	}
}

func TestParseChartResponse_EmptyResult(t *testing.T) {
	body := []byte(`{"chart":{"result":[],"error":null}}`)
	prices, err := parseChartResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices for empty result, got %d", len(prices))
	}
}

func TestParseChartResponse_EmptyTimestamp(t *testing.T) {
	body := []byte(`{"chart":{"result":[{"timestamp":[],"indicators":{"quote":[]}}],"error":null}}`)
	prices, err := parseChartResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices for empty timestamp, got %d", len(prices))
	}
}

func TestParseChartResponse_APIError(t *testing.T) {
	body := []byte(`{"chart":{"result":[],"error":{"code":"Not Found","description":"No data found"}}}`)
	_, err := parseChartResponse(body)
	if err == nil {
		t.Fatal("expected error for API error response, got nil")
	}
}

func TestParseChartResponse_MalformedJSON(t *testing.T) {
	_, err := parseChartResponse([]byte(`{invalid json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParseChartResponse_ZeroCloseSkipped(t *testing.T) {
	ts1 := int64(1704067200)
	ts2 := int64(1704153600)
	body := []byte(`{
		"chart":{
			"result":[{
				"timestamp":[` + strconv.FormatInt(ts1, 10) + `,` + strconv.FormatInt(ts2, 10) + `],
				"indicators":{
					"quote":[{
						"open":[100.0, 101.0],
						"high":[105.0, 106.0],
						"low":[99.0, 100.0],
						"close":[0, 104.0],
						"volume":[1000000.0, 1200000.0]
					}]
				}
			}],
			"error":null
		}
	}`)

	prices, err := parseChartResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price (skip zero close), got %d", len(prices))
	}
	if prices[0].Close != 104.0 {
		t.Errorf("Close = %v, want 104.0", prices[0].Close)
	}
}

func TestParseChartResponse_NoAdjClose_FallsBackToClose(t *testing.T) {
	ts1 := int64(1704067200)
	body := []byte(`{
		"chart":{
			"result":[{
				"timestamp":[` + strconv.FormatInt(ts1, 10) + `],
				"indicators":{
					"quote":[{
						"open":[100.0],
						"high":[105.0],
						"low":[99.0],
						"close":[103.0],
						"volume":[1000000.0]
					}]
				}
			}],
			"error":null
		}
	}`)

	prices, err := parseChartResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price, got %d", len(prices))
	}
	// 无 adjclose 时应回退到 close
	if prices[0].AdjustedClose != 103.0 {
		t.Errorf("AdjustedClose = %v, want 103.0 (fallback to close)", prices[0].AdjustedClose)
	}
}

func TestParseSearchResponse_Success(t *testing.T) {
	body := []byte(`{
		"quotes":[
			{"symbol":"AAPL","shortname":"Apple Inc","longname":"Apple Inc.","quoteType":"EQUITY","exchange":"Nasdaq"},
			{"symbol":"MSFT","shortname":"","longname":"Microsoft Corporation","quoteType":"EQUITY","exchange":"Nasdaq"}
		]
	}`)

	results, err := parseSearchResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	if results[0].Ticker != "AAPL" {
		t.Errorf("Ticker[0] = %q, want AAPL", results[0].Ticker)
	}
	if results[0].Name != "Apple Inc" {
		t.Errorf("Name[0] = %q, want Apple Inc (shortname)", results[0].Name)
	}
	// 第二条 shortname 为空，应回退到 longname
	if results[1].Name != "Microsoft Corporation" {
		t.Errorf("Name[1] = %q, want Microsoft Corporation (longname fallback)", results[1].Name)
	}
	if results[0].Market != "美股" {
		t.Errorf("Market[0] = %q, want 美股", results[0].Market)
	}
}

func TestParseSearchResponse_EmptyQuotes(t *testing.T) {
	body := []byte(`{"quotes":[]}`)
	results, err := parseSearchResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestParseSearchResponse_MalformedJSON(t *testing.T) {
	_, err := parseSearchResponse([]byte(`{invalid`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

// TestFetchStockDaily_HTTPError 验证 HTTP 错误时返回错误
func TestFetchStockDaily_HTTPError(t *testing.T) {
	p := NewProvider()
	origClient := httpClient
	defer func() { httpClient = origClient }()
	httpClient = httpclient.New("test", httpclient.Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})

	_, err := p.FetchStockDaily("INVALID@@@TICKER", "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for HTTP failure, got nil")
	}
}
