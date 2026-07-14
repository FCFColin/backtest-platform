package provider

import (
	"errors"
	"testing"
)

// mockProvider 用于测试的可控 Provider 实现
type mockProvider struct {
	name    string
	prices  []DailyPrice
	err     error
	calls   int
}

func (m *mockProvider) Name() string { return m.name }
func (m *mockProvider) FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error) {
	m.calls++
	if m.err != nil {
		return nil, m.err
	}
	return m.prices, nil
}
func (m *mockProvider) SearchTicker(query string) ([]TickerInfo, error) {
	return nil, nil
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

	cases := []string{
		"000001_SZ",
		"600519_SH",
		"000001.SZ",
		"600519.SH",
	}
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

func TestRegistry_ForTicker_AShare_AkshareMissing_Fallback(t *testing.T) {
	// A 股但 akshare 未注册，应回退到完整链
	r := NewRegistry([]string{"akshare", "finnhub", "yfinance"})
	finnhub := &mockProvider{name: "finnhub"}
	yfinance := &mockProvider{name: "yfinance"}
	r.Register(finnhub)
	r.Register(yfinance)

	providers := r.ForTicker("000001_SZ")
	if len(providers) != 2 {
		t.Fatalf("expected 2 fallback providers for A-share without akshare, got %d", len(providers))
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
	// 第二个 provider 不应被调用
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
	// p3 不应被调用
	if p3.calls != 0 {
		t.Errorf("p3 should not be called, got %d calls", p3.calls)
	}
}
