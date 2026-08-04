package httpclient

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNew(t *testing.T) {
	for _, tc := range []struct {
		name       string
		opts       Options
		wantDelay  time.Duration
		wantRetry  int
		wantUAs    int
		wantHeader string
	}{
		{"default", Options{}, 500 * time.Millisecond, 3, 1, ""},
		{"custom", Options{
			RequestDelay: 100 * time.Millisecond,
			MaxRetries:   5,
			UserAgents:   []string{"UA1", "UA2"},
			ExtraHeaders: map[string]string{"X-Custom": "val"},
		}, 100 * time.Millisecond, 5, 2, "val"},
	} {
		c := New("svc", tc.opts)
		if c == nil || c.httpClient == nil || c.httpClient.Jar == nil {
			t.Fatalf("%s: New() missing internal client", tc.name)
		}
		if c.requestDelay != tc.wantDelay {
			t.Errorf("%s: requestDelay=%v want %v", tc.name, c.requestDelay, tc.wantDelay)
		}
		if c.maxRetries != tc.wantRetry {
			t.Errorf("%s: maxRetries=%d want %d", tc.name, c.maxRetries, tc.wantRetry)
		}
		if len(c.userAgents) != tc.wantUAs {
			t.Errorf("%s: userAgents len=%d want %d", tc.name, len(c.userAgents), tc.wantUAs)
		}
		if tc.wantHeader != "" && c.extraHeaders["X-Custom"] != tc.wantHeader {
			t.Errorf("%s: extraHeaders X-Custom=%q want %q", tc.name, c.extraHeaders["X-Custom"], tc.wantHeader)
		}
	}
}

func TestGet_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"hello":"world"}`))
	}))
	defer ts.Close()
	body, err := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1}).Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"hello":"world"}` {
		t.Errorf("body=%q want {\"hello\":\"world\"}", string(body))
	}
}

func captureGetHeaders(t *testing.T, uas []string, extra, perReq map[string]string) map[string]string {
	received := make(map[string]string)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, h := range []string{"User-Agent", "X-Custom-Header", "X-Override"} {
			received[h] = r.Header.Get(h)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()
	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1, UserAgents: uas, ExtraHeaders: extra})
	if _, err := c.Get(ts.URL, perReq); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return received
}

func TestGet_SetsRequestHeaders(t *testing.T) {
	for _, tc := range []struct {
		name, wantHeader, wantValue string
		uas                         []string
		extra, perReq               map[string]string
	}{
		{"user agent", "User-Agent", "TestUA/1.0", []string{"TestUA/1.0"}, nil, nil},
		{"extra header", "X-Custom-Header", "custom-value", nil, map[string]string{"X-Custom-Header": "custom-value"}, nil},
		{"per-request overrides", "X-Override", "overridden", nil, map[string]string{"X-Override": "default"}, map[string]string{"X-Override": "overridden"}},
	} {
		if got := captureGetHeaders(t, tc.uas, tc.extra, tc.perReq)[tc.wantHeader]; got != tc.wantValue {
			t.Errorf("%s: %s=%q want %q", tc.name, tc.wantHeader, got, tc.wantValue)
		}
	}
}

func TestGet_RetryBehavior(t *testing.T) {
	for _, tc := range []struct {
		name, retryAfter, wantErrContains string
		status                            int
		wantErr                           bool
	}{
		{"retries on 500", "", "", http.StatusInternalServerError, true},
		{"retries on 429", "0", "限流", http.StatusTooManyRequests, true},
		{"no success on 404", "", "", http.StatusNotFound, true},
	} {
		var attempts int32
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&attempts, 1)
			if tc.retryAfter != "" {
				w.Header().Set("Retry-After", tc.retryAfter)
			}
			w.WriteHeader(tc.status)
		}))
		c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 2})
		_, err := c.Get(ts.URL)
		ts.Close()
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: err=%v wantErr=%v", tc.name, err, tc.wantErr)
		}
		if tc.wantErrContains != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErrContains)) {
			t.Errorf("%s: err=%v want contains %q", tc.name, err, tc.wantErrContains)
		}
		if got := atomic.LoadInt32(&attempts); got != 2 {
			t.Errorf("%s: attempts=%d want 2", tc.name, got)
		}
	}
}

func TestGet_429Recovers(t *testing.T) {
	var attempts int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&attempts, 1) == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()
	body, err := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 3}).Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Errorf("body=%q want {\"ok\":true}", string(body))
	}
}

func TestParseRetryAfter(t *testing.T) {
	for _, tc := range []struct {
		name, value string
		want        time.Duration
		wantFuture  bool
	}{
		{"integer seconds", "10", 10 * time.Second, false},
		{"empty", "", 5 * time.Second, false},
		{"invalid", "not-a-number", 5 * time.Second, false},
		{"http date", "Wed, 21 Oct 2099 07:28:00 GMT", 0, true},
	} {
		h := http.Header{}
		if tc.value != "" {
			h.Set("Retry-After", tc.value)
		}
		d := parseRetryAfter(h)
		if tc.wantFuture {
			if d <= 0 {
				t.Errorf("%s: got %v, want positive", tc.name, d)
			}
		} else if d != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, d, tc.want)
		}
	}
}

func TestThrottle_EnforcesDelay(t *testing.T) {
	c := New("test", Options{RequestDelay: 50 * time.Millisecond, MaxRetries: 1})
	start := time.Now()
	c.throttle()
	if elapsed := time.Since(start); elapsed > 30*time.Millisecond {
		t.Errorf("first throttle took %v, should be near-instant", elapsed)
	}
	c.throttle()
	if elapsed := time.Since(start); elapsed < 40*time.Millisecond {
		t.Errorf("second throttle took %v, should be >= 40ms", elapsed)
	}
}

func TestRandomUA_ReturnsValidAgent(t *testing.T) {
	uas := []string{"UA1", "UA2", "UA3"}
	c := New("test", Options{UserAgents: uas, MaxRetries: 1})
	for i := 0; i < 10; i++ {
		ua := c.randomUA()
		valid := false
		for _, v := range uas {
			if ua == v {
				valid = true
			}
		}
		if !valid {
			t.Errorf("randomUA() returned %q not in list %v", ua, uas)
		}
	}
}

func TestGet_ConnectionError(t *testing.T) {
	c := New("test", Options{
		RequestDelay:   1 * time.Millisecond,
		MaxRetries:     1,
		ConnectTimeout: 100 * time.Millisecond,
		ReadTimeout:    100 * time.Millisecond,
	})
	if _, err := c.Get("http://127.0.0.1:1/test"); err == nil {
		t.Fatal("expected error for connection refused, got nil")
	}
}

func TestMin(t *testing.T) {
	for _, tc := range []struct{ a, b, want int }{
		{3, 5, 3}, {5, 3, 3}, {0, 0, 0},
	} {
		if got := min(tc.a, tc.b); got != tc.want {
			t.Errorf("min(%d,%d)=%d want %d", tc.a, tc.b, got, tc.want)
		}
	}
}
