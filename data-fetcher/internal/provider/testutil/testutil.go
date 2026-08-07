package testutil

import (
	"math"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
	"data-fetcher/internal/provider"
)

type ParseCase[In, Out any] struct {
	Name    string
	In      In
	Want    Out
	WantErr bool
}

func RunParse[In, Out any](t *testing.T, cases []ParseCase[In, Out], parse func(In) (Out, error), assert func(*testing.T, Out, Out)) {
	t.Helper()
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			got, err := parse(c.In)
			if c.WantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			assert(t, got, c.Want)
		})
	}
}

func AssertPricesEqual(t *testing.T, got, want []provider.DailyPrice) {
	t.Helper()
	AssertPrices(t, got, want...)
}

func AssertEqual[T comparable](t *testing.T, got, want []T) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("expected %d results, got %d", len(want), len(got))
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("results[%d] = %+v, want %+v", i, got[i], w)
		}
	}
}

func AssertPrices(t *testing.T, got []provider.DailyPrice, want ...provider.DailyPrice) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("expected %d prices, got %d", len(want), len(got))
	}
	for i, w := range want {
		g := got[i]
		if g.Date != w.Date {
			t.Errorf("prices[%d].Date = %q, want %q", i, g.Date, w.Date)
		}
		if math.Abs(g.Open-w.Open) > 1e-6 {
			t.Errorf("prices[%d].Open = %v, want %v", i, g.Open, w.Open)
		}
		if math.Abs(g.High-w.High) > 1e-6 {
			t.Errorf("prices[%d].High = %v, want %v", i, g.High, w.High)
		}
		if math.Abs(g.Low-w.Low) > 1e-6 {
			t.Errorf("prices[%d].Low = %v, want %v", i, g.Low, w.Low)
		}
		if math.Abs(g.Close-w.Close) > 1e-6 {
			t.Errorf("prices[%d].Close = %v, want %v", i, g.Close, w.Close)
		}
		if g.Volume != w.Volume {
			t.Errorf("prices[%d].Volume = %d, want %d", i, g.Volume, w.Volume)
		}
		if math.Abs(g.AdjustedClose-w.AdjustedClose) > 1e-6 {
			t.Errorf("prices[%d].AdjustedClose = %v, want %v", i, g.AdjustedClose, w.AdjustedClose)
		}
	}
}

// FastFailClient 返回请求即时失败的 HTTP 客户端，用于触发 provider 的 HTTP 错误路径。
func FastFailClient() *httpclient.Client {
	return httpclient.New("test", httpclient.Options{
		RequestDelay:   1 * time.Millisecond,
		MaxRetries:     1,
		ConnectTimeout: 1 * time.Millisecond,
		ReadTimeout:    1 * time.Millisecond,
	})
}

// AssertHTTPError 断言 provider 在 HTTP 失败时返回错误。
func AssertHTTPError(t *testing.T, p provider.Provider, ticker, start, end string) {
	t.Helper()
	if p == nil {
		t.Fatal("provider is nil")
	}
	if _, err := p.FetchStockDaily(ticker, start, end); err == nil {
		t.Fatal("expected error for HTTP failure, got nil")
	}
}
