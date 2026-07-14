package twelvedata

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
)

func TestParseTwelveFloat(t *testing.T) {
	cases := []struct {
		input string
		want  float64
	}{
		{"3.14", 3.14},
		{"0", 0},
		{"", 0},
		{"  10.5  ", 10.5}, // 带空格
		{"invalid", 0},
	}
	for _, c := range cases {
		got := parseTwelveFloat(c.input)
		if got != c.want {
			t.Errorf("parseTwelveFloat(%q) = %v, want %v", c.input, got, c.want)
		}
	}
}

func TestParseTwelveInt(t *testing.T) {
	cases := []struct {
		input string
		want  int64
	}{
		{"1000000", 1000000},
		{"3.7", 3}, // float 字符串截断为 int
		{"0", 0},
		{"", 0},
		{"  500  ", 500},
		{"invalid", 0},
	}
	for _, c := range cases {
		got := parseTwelveInt(c.input)
		if got != c.want {
			t.Errorf("parseTwelveInt(%q) = %d, want %d", c.input, got, c.want)
		}
	}
}

func TestNewProvider_WithoutAPIKey(t *testing.T) {
	key := os.Getenv("TWELVE_DATA_API_KEY")
	os.Unsetenv("TWELVE_DATA_API_KEY")
	defer func() {
		if key != "" {
			os.Setenv("TWELVE_DATA_API_KEY", key)
		}
	}()

	p := NewProvider()
	if p != nil {
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

// parseTimeSeries 复刻 FetchStockDaily 内部的 timeSeriesResponse 解析与日期过滤逻辑，
// 用于单元测试验证 struct tag、状态分支、日期范围过滤（源码中解析内嵌于 breaker.Execute）。
func parseTimeSeries(body []byte, startDate, endDate string) ([]provider.DailyPrice, error) {
	var resp timeSeriesResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.Status == "error" {
		msg := resp.Message
		if msg == "" {
			msg = "unknown error"
		}
		return nil, errors.New("Twelve Data API 错误: " + msg)
	}
	if resp.Status != "ok" {
		return nil, errors.New("Twelve Data API 异常状态: " + resp.Status)
	}

	start, _ := time.Parse("2006-01-02", startDate)
	end, _ := time.Parse("2006-01-02", endDate)

	var prices []provider.DailyPrice
	for _, v := range resp.Values {
		t, err := time.Parse("2006-01-02", v.Datetime)
		if err != nil {
			continue
		}
		if t.Before(start) || t.After(end) {
			continue
		}
		close := parseTwelveFloat(v.Close)
		if close == 0 {
			continue
		}
		prices = append(prices, provider.DailyPrice{
			Date:          v.Datetime,
			Open:          parseTwelveFloat(v.Open),
			High:          parseTwelveFloat(v.High),
			Low:           parseTwelveFloat(v.Low),
			Close:         close,
			Volume:        parseTwelveInt(v.Volume),
			AdjustedClose: close,
		})
	}
	return prices, nil
}

func TestParseTimeSeries_Success(t *testing.T) {
	body := []byte(`{
		"status":"ok",
		"values":[
			{"datetime":"2024-01-02","open":"100.5","high":"105.0","low":"99.0","close":"103.0","volume":"1000000"},
			{"datetime":"2024-01-03","open":"103.0","high":"106.0","low":"102.0","close":"104.5","volume":"1200000"}
		]
	}`)

	prices, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 2 {
		t.Fatalf("expected 2 prices, got %d", len(prices))
	}
	if prices[0].Close != 103.0 {
		t.Errorf("Close[0] = %v, want 103.0", prices[0].Close)
	}
	if prices[0].Volume != 1000000 {
		t.Errorf("Volume[0] = %d, want 1000000", prices[0].Volume)
	}
}

func TestParseTimeSeries_ErrorStatus(t *testing.T) {
	body := []byte(`{"status":"error","message":"API key invalid"}`)
	_, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for status=error, got nil")
	}
}

func TestParseTimeSeries_ErrorStatusNoMessage(t *testing.T) {
	body := []byte(`{"status":"error"}`)
	_, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for status=error without message, got nil")
	}
}

func TestParseTimeSeries_AbnormalStatus(t *testing.T) {
	body := []byte(`{"status":"unknown"}`)
	_, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for abnormal status, got nil")
	}
}

func TestParseTimeSeries_MalformedJSON(t *testing.T) {
	_, err := parseTimeSeries([]byte(`{invalid`), "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParseTimeSeries_DateFilter(t *testing.T) {
	body := []byte(`{
		"status":"ok",
		"values":[
			{"datetime":"2023-12-31","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
			{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
			{"datetime":"2024-02-01","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
		]
	}`)

	// 只取 2024-01-01 到 2024-01-31 之间的数据
	prices, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price in date range, got %d", len(prices))
	}
	if prices[0].Date != "2024-01-02" {
		t.Errorf("Date = %q, want 2024-01-02", prices[0].Date)
	}
}

func TestParseTimeSeries_ZeroCloseSkipped(t *testing.T) {
	body := []byte(`{
		"status":"ok",
		"values":[
			{"datetime":"2024-01-02","open":"100","high":"105","low":"99","close":"0","volume":"1000"},
			{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"103","volume":"1000"}
		]
	}`)

	prices, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price (skip zero close), got %d", len(prices))
	}
}

func TestParseTimeSeries_InvalidDateSkipped(t *testing.T) {
	body := []byte(`{
		"status":"ok",
		"values":[
			{"datetime":"invalid-date","open":"100","high":"105","low":"99","close":"103","volume":"1000"},
			{"datetime":"2024-01-03","open":"100","high":"105","low":"99","close":"104","volume":"1000"}
		]
	}`)

	prices, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price (skip invalid date), got %d", len(prices))
	}
}

func TestParseTimeSeries_EmptyValues(t *testing.T) {
	body := []byte(`{"status":"ok","values":[]}`)
	prices, err := parseTimeSeries(body, "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices, got %d", len(prices))
	}
}

// TestFetchStockDaily_HTTPError 验证 HTTP 错误时返回错误。
// 使用极短超时使连接快速失败（URL 硬编码到 twelvedata.com，无法重定向到测试服务器）。
func TestFetchStockDaily_HTTPError(t *testing.T) {
	os.Setenv("TWELVE_DATA_API_KEY", "test-key")
	defer os.Unsetenv("TWELVE_DATA_API_KEY")

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
