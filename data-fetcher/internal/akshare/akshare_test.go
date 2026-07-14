package akshare

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
)

// 构造东方财富 kline 字符串：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
func validKline(date, open, close, high, low, vol string) string {
	return date + "," + open + "," + close + "," + high + "," + low + "," + vol + ",100000,1.5,2.5,0.2,3.0"
}

// eastMoneyResponse 的 JSON 序列化辅助
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

func TestParseDailyPrices_Success(t *testing.T) {
	klines := []string{
		validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000"),
		validKline("2024-01-03", "10.8", "11.2", "11.5", "10.7", "1200000"),
	}
	body := buildEastMoneyJSON(klines, false)

	prices, err := parseDailyPrices(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 2 {
		t.Fatalf("expected 2 prices, got %d", len(prices))
	}

	p := prices[0]
	if p.Date != "2024-01-02" {
		t.Errorf("Date = %q, want 2024-01-02", p.Date)
	}
	if p.Open != 10.5 {
		t.Errorf("Open = %v, want 10.5", p.Open)
	}
	if p.Close != 10.8 {
		t.Errorf("Close = %v, want 10.8", p.Close)
	}
	if p.High != 11.0 {
		t.Errorf("High = %v, want 11.0", p.High)
	}
	if p.Low != 10.3 {
		t.Errorf("Low = %v, want 10.3", p.Low)
	}
	if p.Volume != 1000000 {
		t.Errorf("Volume = %d, want 1000000", p.Volume)
	}
	if p.AdjustedClose != 10.8 {
		t.Errorf("AdjustedClose = %v, want 10.8", p.AdjustedClose)
	}
}

func TestParseDailyPrices_NilData(t *testing.T) {
	body := buildEastMoneyJSON(nil, true)
	_, err := parseDailyPrices(body)
	if err == nil {
		t.Fatal("expected error for nil data, got nil")
	}
}

func TestParseDailyPrices_MalformedJSON(t *testing.T) {
	_, err := parseDailyPrices([]byte(`{invalid json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestParseDailyPrices_EmptyKlines(t *testing.T) {
	body := buildEastMoneyJSON([]string{}, false)
	prices, err := parseDailyPrices(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 0 {
		t.Fatalf("expected 0 prices, got %d", len(prices))
	}
}

func TestParseDailyPrices_ShortKlineSkipped(t *testing.T) {
	klines := []string{
		validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000"),
		"2024-01-03,10.8,11.2", // 不足 11 段，应跳过
	}
	body := buildEastMoneyJSON(klines, false)

	prices, err := parseDailyPrices(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 valid price (skip short), got %d", len(prices))
	}
}

func TestParseDailyPrices_EmptyFields(t *testing.T) {
	// 验证空字符串字段解析为 0 而非 panic
	kline := "2024-01-02,,,,,1000000,100000,1.5,2.5,0.2,3.0"
	body := buildEastMoneyJSON([]string{kline}, false)

	prices, err := parseDailyPrices(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price, got %d", len(prices))
	}
	if prices[0].Open != 0 {
		t.Errorf("Open = %v, want 0 for empty string", prices[0].Open)
	}
	if prices[0].Volume != 1000000 {
		t.Errorf("Volume = %d, want 1000000", prices[0].Volume)
	}
}

func TestParseCodeAndMarket(t *testing.T) {
	cases := []struct {
		ticker      string
		wantCode    string
		wantMarket  string
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

func TestParseFloat(t *testing.T) {
	if v := parseFloat(""); v != 0 {
		t.Errorf("parseFloat(\"\") = %v, want 0", v)
	}
	if v := parseFloat("3.14"); v != 3.14 {
		t.Errorf("parseFloat(\"3.14\") = %v, want 3.14", v)
	}
	if v := parseFloat("invalid"); v != 0 {
		t.Errorf("parseFloat(\"invalid\") = %v, want 0", v)
	}
}

func TestParseInt64(t *testing.T) {
	if v := parseInt64(""); v != 0 {
		t.Errorf("parseInt64(\"\") = %d, want 0", v)
	}
	if v := parseInt64("1000000"); v != 1000000 {
		t.Errorf("parseInt64(\"1000000\") = %d, want 1000000", v)
	}
	if v := parseInt64("invalid"); v != 0 {
		t.Errorf("parseInt64(\"invalid\") = %d, want 0", v)
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

// TestDoWithRetry_HTTPError 验证 doWithRetry 在 HTTP 非 200 时返回错误。
// 使用 httptest 模拟服务器返回 500，替换包级 httpClient 使其指向测试服务器。
func TestDoWithRetry_HTTPError(t *testing.T) {
	origClient := httpClient
	defer func() { httpClient = origClient }()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`internal server error`))
	}))
	defer ts.Close()

	// 用指向测试服务器的 httpClient 替换包级变量（短延迟避免测试缓慢）
	httpClient = httpclient.New("test", httpclient.Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})

	_, err := doWithRetry(ts.URL + "/test")
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
}

// TestDoWithRetry_ParseError 验证 doWithRetry 在解析失败（data:null）时返回错误
func TestDoWithRetry_ParseError(t *testing.T) {
	origClient := httpClient
	defer func() { httpClient = origClient }()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":null}`))
	}))
	defer ts.Close()

	httpClient = httpclient.New("test", httpclient.Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})

	_, err := doWithRetry(ts.URL + "/test")
	if err == nil {
		t.Fatal("expected error for nil data, got nil")
	}
}

// TestDoWithRetry_Success 验证 doWithRetry 成功路径（有效 JSON 响应被正确解析）
func TestDoWithRetry_Success(t *testing.T) {
	origClient := httpClient
	defer func() { httpClient = origClient }()

	kline := validKline("2024-01-02", "10.5", "10.8", "11.0", "10.3", "1000000")
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(buildEastMoneyJSON([]string{kline}, false))
	}))
	defer ts.Close()

	httpClient = httpclient.New("test", httpclient.Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})

	prices, err := doWithRetry(ts.URL + "/test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prices) != 1 {
		t.Fatalf("expected 1 price, got %d", len(prices))
	}
	if prices[0].Close != 10.8 {
		t.Errorf("Close = %v, want 10.8", prices[0].Close)
	}
}
