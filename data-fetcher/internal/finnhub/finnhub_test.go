package finnhub

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
)

// parseCandleResponse 复刻 FetchStockDaily 内部的 candleResponse 解析逻辑，
// 用于单元测试验证 struct tag 与状态分支处理（源码中解析逻辑内嵌于 breaker.Execute）。
func parseCandleResponse(body []byte) ([]provider.DailyPrice, error) {
	var resp candleResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.S == "no_data" {
		return []provider.DailyPrice{}, nil
	}
	if resp.S != "ok" {
		return nil, errors.New("Finnhub API 错误: status=" + resp.S)
	}
	n := len(resp.T)
	if n == 0 {
		return []provider.DailyPrice{}, nil
	}
	prices := make([]provider.DailyPrice, 0, n)
	for i := 0; i < n; i++ {
		if i >= len(resp.C) {
			break
		}
		if resp.C[i] == 0 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date:          time.Unix(resp.T[i], 0).Format("2006-01-02"),
			Open:          resp.O[i],
			High:          resp.H[i],
			Low:           resp.L[i],
			Close:         resp.C[i],
			Volume:        int64(resp.V[i]),
			AdjustedClose: resp.C[i],
		})
	}
	return prices, nil
}

// parseSearchResponse 复刻 SearchTicker 内部的 searchResponse 解析逻辑
func parseSearchResponse(body []byte) ([]provider.TickerInfo, error) {
	var resp searchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	var results []provider.TickerInfo
	for _, r := range resp.Result {
		results = append(results, provider.TickerInfo{
			Ticker: r.Symbol,
			Name:   r.Description,
			Market: "美股",
		})
	}
	return results, nil
}

func TestDateToUnix(t *testing.T) {
	// 2024-01-01 00:00:00 UTC = 1704067200
	ts := dateToUnix("2024-01-01")
	if ts != 1704067200 {
		t.Errorf("dateToUnix(\"2024-01-01\") = %d, want 1704067200", ts)
	}
}

func TestDateToUnix_Invalid(t *testing.T) {
	ts := dateToUnix("invalid-date")
	if ts != 0 {
		t.Errorf("dateToUnix(\"invalid-date\") = %d, want 0", ts)
	}
}

func TestParseCandleResponse_Success(t *testing.T) {
	body := []byte(`{
		"s":"ok",
		"t":[1704067200, 1704153600],
		"o":[100.0, 101.0],
		"h":[105.0, 106.0],
		"l":[99.0, 100.0],
		"c":[103.0, 104.0],
		"v":[1000000.0, 1200000.0]
	}`)

	prices, err := parseCandleResponse(body)
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

func TestParseCandleResponse_NoData(t *testing.T) {
	body := []byte(`{"s":"no_data"}`)
	prices, err := parseCandleResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices for no_data, got %d", len(prices))
	}
}

func TestParseCandleResponse_ErrorStatus(t *testing.T) {
	body := []byte(`{"s":"error"}`)
	_, err := parseCandleResponse(body)
	if err == nil {
		t.Fatal("expected error for status=error, got nil")
	}
}

func TestParseCandleResponse_MalformedJSON(t *testing.T) {
	_, err := parseCandleResponse([]byte(`{invalid`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParseCandleResponse_EmptyArrays(t *testing.T) {
	body := []byte(`{"s":"ok","t":[],"o":[],"h":[],"l":[],"c":[],"v":[]}`)
	prices, err := parseCandleResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices for empty arrays, got %d", len(prices))
	}
}

func TestParseCandleResponse_ZeroCloseSkipped(t *testing.T) {
	body := []byte(`{
		"s":"ok",
		"t":[1704067200, 1704153600],
		"o":[100.0, 101.0],
		"h":[105.0, 106.0],
		"l":[99.0, 100.0],
		"c":[0, 104.0],
		"v":[1000000.0, 1200000.0]
	}`)

	prices, err := parseCandleResponse(body)
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

func TestParseCandleResponse_CloseArrayShorterThanT(t *testing.T) {
	// T 有 2 个元素，C 只有 1 个，应在 i>=len(C) 时 break
	body := []byte(`{
		"s":"ok",
		"t":[1704067200, 1704153600],
		"o":[100.0, 101.0],
		"h":[105.0, 106.0],
		"l":[99.0, 100.0],
		"c":[103.0],
		"v":[1000000.0, 1200000.0]
	}`)

	prices, err := parseCandleResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price (break on short C), got %d", len(prices))
	}
}

func TestParseSearchResponse_Success(t *testing.T) {
	body := []byte(`{
		"result": [
			{"symbol":"AAPL","description":"Apple Inc","type":"Common Stock"},
			{"symbol":"MSFT","description":"Microsoft Corp","type":"Common Stock"}
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
		t.Errorf("Name[0] = %q, want Apple Inc", results[0].Name)
	}
	if results[0].Market != "美股" {
		t.Errorf("Market[0] = %q, want 美股", results[0].Market)
	}
}

func TestParseSearchResponse_EmptyResult(t *testing.T) {
	body := []byte(`{"result":[]}`)
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

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	key := os.Getenv("FINNHUB_API_KEY")
	os.Unsetenv("FINNHUB_API_KEY")
	defer func() {
		if key != "" {
			os.Setenv("FINNHUB_API_KEY", key)
		}
	}()

	p := NewProvider()
	if p != nil {
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

// TestFetchStockDaily_HTTPError 验证 HTTP 错误时返回错误。
// 使用极短超时使连接快速失败（URL 硬编码到 finnhub.io，无法重定向到测试服务器）。
func TestFetchStockDaily_HTTPError(t *testing.T) {
	os.Setenv("FINNHUB_API_KEY", "test-key")
	defer os.Unsetenv("FINNHUB_API_KEY")

	p := NewProvider()
	if p == nil {
		t.Fatal("provider is nil")
	}

	origClient := httpClient
	defer func() { httpClient = origClient }()
	httpClient = httpclient.New("test", httpclient.Options{
		RequestDelay:   1 * time.Millisecond,
		MaxRetries:     1,
		ConnectTimeout: 1 * time.Millisecond,
		ReadTimeout:    1 * time.Millisecond,
	})

	_, err := p.FetchStockDaily("AAPL", "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for HTTP failure, got nil")
	}
}
