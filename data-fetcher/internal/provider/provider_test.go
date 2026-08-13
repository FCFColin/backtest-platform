package provider

import (
	"errors"
	"reflect"
	"testing"
)

type mockProvider struct {
	name   string
	prices []DailyPrice
	err    error
	calls  int
}

func (m *mockProvider) Name() string { return m.name }
func (m *mockProvider) FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error) {
	m.calls++
	if m.err != nil {
		return nil, m.err
	}
	return m.prices, nil
}
func TestNewRegistry(t *testing.T) {
	r := NewRegistry([]string{"akshare", "finnhub", "yfinance"})
	if r == nil {
		t.Fatal("NewRegistry() returned nil")
	}
	if len(r.priorities) != 3 {
		t.Errorf("priorities len = %d, want 3", len(r.priorities))
	}
}
func TestRegistry_Register(t *testing.T) {
	r := NewRegistry([]string{"finnhub", "yfinance"})
	p := &mockProvider{name: "finnhub"}
	r.Register(p)
	if _, ok := r.providers["finnhub"]; !ok {
		t.Error("provider not registered under name finnhub")
	}
}
func TestRegistry_ForTicker_AShare_RoutesToAkshare(t *testing.T) {
	r := NewRegistry([]string{"akshare", "finnhub", "yfinance"})
	akshare := &mockProvider{name: "akshare"}
	finnhub := &mockProvider{name: "finnhub"}
	yfinance := &mockProvider{name: "yfinance"}
	r.Register(akshare)
	r.Register(finnhub)
	r.Register(yfinance)
	cases := []string{"000001_SZ", "600519_SH", "000001.SZ", "600519.SH"}
	for _, ticker := range cases {
		providers := r.ForTicker(ticker)
		if len(providers) != 1 {
			t.Errorf("ForTicker(%q) returned %d providers, want 1 (akshare only)", ticker, len(providers))
			continue
		}
		if providers[0].Name() != "akshare" {
			t.Errorf("ForTicker(%q) routed to %s, want akshare", ticker, providers[0].Name())
		}
	}
}
func TestRegistry_ForTicker_NonAShare_UsesFullChain(t *testing.T) {
	r := NewRegistry([]string{"finnhub", "yfinance"})
	finnhub := &mockProvider{name: "finnhub"}
	yfinance := &mockProvider{name: "yfinance"}
	r.Register(finnhub)
	r.Register(yfinance)
	providers := r.ForTicker("AAPL")
	if len(providers) != 2 {
		t.Fatalf("ForTicker(AAPL) returned %d providers, want 2", len(providers))
	}
	if providers[0].Name() != "finnhub" {
		t.Errorf("first provider = %s, want finnhub", providers[0].Name())
	}
	if providers[1].Name() != "yfinance" {
		t.Errorf("second provider = %s, want yfinance", providers[1].Name())
	}
}
func TestRegistry_ForTicker_AShare_AkshareMissing_NoWrongMarketFallback(t *testing.T) {
	r := NewRegistry([]string{"akshare", "finnhub", "yfinance"})
	finnhub := &mockProvider{name: "finnhub"}
	yfinance := &mockProvider{name: "yfinance"}
	r.Register(finnhub)
	r.Register(yfinance)
	providers := r.ForTicker("000001_SZ")
	if len(providers) != 0 {
		t.Fatalf("A-share without akshare must not fall back to US chain, got %d providers", len(providers))
	}
}
func TestFetchWithFallback_FirstSucceeds(t *testing.T) {
	prices := []DailyPrice{{Date: "2024-01-01", Close: 100}}
	p1 := &mockProvider{name: "p1", prices: prices}
	p2 := &mockProvider{name: "p2"}
	result, used, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if used != "p1" {
		t.Errorf("used provider = %q, want p1", used)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 price, got %d", len(result))
	}
	if result[0].Close != 100 {
		t.Errorf("Close = %v, want 100", result[0].Close)
	}
	if p2.calls != 0 {
		t.Errorf("p2 should not be called, got %d calls", p2.calls)
	}
}
func TestFetchWithFallback_FirstFails_SecondSucceeds(t *testing.T) {
	prices := []DailyPrice{{Date: "2024-01-01", Close: 200}}
	p1 := &mockProvider{name: "p1", err: errors.New("network error")}
	p2 := &mockProvider{name: "p2", prices: prices}
	result, used, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if used != "p2" {
		t.Errorf("used provider = %q, want p2", used)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 price, got %d", len(result))
	}
	if result[0].Close != 200 {
		t.Errorf("Close = %v, want 200", result[0].Close)
	}
	if p1.calls != 1 {
		t.Errorf("p1 should be called once, got %d", p1.calls)
	}
	if p2.calls != 1 {
		t.Errorf("p2 should be called once, got %d", p2.calls)
	}
}
func TestFetchWithFallback_FirstEmpty_SecondSucceeds(t *testing.T) {
	prices := []DailyPrice{{Date: "2024-01-01", Close: 200}}
	p1 := &mockProvider{name: "p1"}
	p2 := &mockProvider{name: "p2", prices: prices}
	result, used, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if used != "p2" {
		t.Errorf("used provider = %q, want p2", used)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 price, got %d", len(result))
	}
	if p1.calls != 1 || p2.calls != 1 {
		t.Errorf("both providers should be called, got p1=%d p2=%d", p1.calls, p2.calls)
	}
}
func TestFetchWithFallback_AllFail(t *testing.T) {
	p1 := &mockProvider{name: "p1", err: errors.New("p1 error")}
	p2 := &mockProvider{name: "p2", err: errors.New("p2 error")}
	_, _, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error when all providers fail, got nil")
	}
	if p1.calls != 1 {
		t.Errorf("p1 should be called once, got %d", p1.calls)
	}
	if p2.calls != 1 {
		t.Errorf("p2 should be called once, got %d", p2.calls)
	}
}
func TestFetchWithFallback_AllEmpty_ReturnsErrAllProvidersEmpty(t *testing.T) {
	p1 := &mockProvider{name: "p1"}
	p2 := &mockProvider{name: "p2"}
	_, _, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if !errors.Is(err, ErrAllProvidersEmpty) {
		t.Fatalf("all-empty error = %v, want ErrAllProvidersEmpty", err)
	}
}
func TestFetchWithFallback_AllFail_NotErrAllProvidersEmpty(t *testing.T) {
	p1 := &mockProvider{name: "p1", err: errors.New("p1 down")}
	p2 := &mockProvider{name: "p2", err: errors.New("p2 down")}
	_, _, err := FetchWithFallback([]Provider{p1, p2}, "AAPL", "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error when all providers fail, got nil")
	}
	if errors.Is(err, ErrAllProvidersEmpty) {
		t.Fatalf("provider failures must not be reported as empty: %v", err)
	}
}
func TestFetchWithFallback_EmptyProviderList(t *testing.T) {
	_, _, err := FetchWithFallback([]Provider{}, "AAPL", "2024-01-01", "2024-01-31")
	if err == nil {
		t.Fatal("expected error for empty provider list, got nil")
	}
}
func TestFetchWithFallback_ThreeProviders_SecondSucceeds(t *testing.T) {
	prices := []DailyPrice{{Date: "2024-01-01", Close: 300}}
	p1 := &mockProvider{name: "p1", err: errors.New("p1 down")}
	p2 := &mockProvider{name: "p2", prices: prices}
	p3 := &mockProvider{name: "p3"}
	result, used, err := FetchWithFallback([]Provider{p1, p2, p3}, "AAPL", "2024-01-01", "2024-01-31")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if used != "p2" {
		t.Errorf("used provider = %q, want p2", used)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 price, got %d", len(result))
	}
	if p3.calls != 0 {
		t.Errorf("p3 should not be called, got %d calls", p3.calls)
	}
}
func TestDeriveExchange(t *testing.T) {
	cases := []struct {
		ticker string
		want   string
	}{
		{"000001_SZ", "SZSE"},
		{"600519_SH", "SSE"},
		{"510050_SS", "SSE"},
		{"000001.SZ", "SZSE"},
		{"600519.SH", "SSE"},
		{"510050.SS", "SSE"},
		{"000001_sz", "SZSE"},
		{"600519.sh", "SSE"},
		{"AAPL", "US"},
		{"SPY", "US"},
		{"VTI", "US"},
		{"_SZ", "SZSE"},
		{".SH", "SSE"},
		{"BRK.B", "US"}, // .B 不是交易所后缀
	}
	for _, c := range cases {
		got := DeriveExchange(c.ticker)
		if got != c.want {
			t.Errorf("DeriveExchange(%q) = %q, want %q", c.ticker, got, c.want)
		}
	}
}
func TestSanitizePrices(t *testing.T) {
	cases := []struct {
		name   string
		prices []DailyPrice
		want   []DailyPrice
	}{
		{"empty", nil, []DailyPrice{}},
		{"swaps high low", []DailyPrice{{Date: "2024-01-01", Open: 100, High: 90, Low: 110, Close: 105, Volume: 1000}}, []DailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: 1000}}},
		{"clamps open close", []DailyPrice{{Date: "2024-01-01", Open: 50, High: 100, Low: 80, Close: 60, Volume: 1000}}, []DailyPrice{{Date: "2024-01-01", Open: 80, High: 100, Low: 80, Close: 80, Volume: 1000}}},
		{"negative volume", []DailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: -500}}, []DailyPrice{{Date: "2024-01-01", Open: 100, High: 110, Low: 90, Close: 105, Volume: 0}}},
		{"already valid", []DailyPrice{{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000}}, []DailyPrice{{Date: "2024-01-01", Open: 95, High: 110, Low: 90, Close: 105, Volume: 1000}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := SanitizePrices(c.prices); !reflect.DeepEqual(got, c.want) {
				t.Errorf("SanitizePrices = %+v, want %+v", got, c.want)
			}
		})
	}
}
