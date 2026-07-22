package httpclient

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNew_DefaultOptions(t *testing.T) {
	c := New("test-service", Options{})
	if c == nil {
		t.Fatal("New() returned nil")
	}
	if c.serviceName != "test-service" {
		t.Errorf("serviceName = %q, want test-service", c.serviceName)
	}
	// 默认值验证
	if c.requestDelay != 500*time.Millisecond {
		t.Errorf("requestDelay = %v, want 500ms", c.requestDelay)
	}
	if c.maxRetries != 3 {
		t.Errorf("maxRetries = %d, want 3", c.maxRetries)
	}
	if len(c.userAgents) != 1 {
		t.Errorf("userAgents len = %d, want 1", len(c.userAgents))
	}
	if c.httpClient == nil {
		t.Error("httpClient is nil")
	}
	if c.httpClient.Jar == nil {
		t.Error("cookie jar not set")
	}
}

func TestNew_CustomOptions(t *testing.T) {
	uas := []string{"UA1", "UA2"}
	c := New("svc", Options{
		RequestDelay:   100 * time.Millisecond,
		ConnectTimeout: 5 * time.Second,
		ReadTimeout:    15 * time.Second,
		MaxRetries:     5,
		UserAgents:     uas,
		ExtraHeaders:   map[string]string{"X-Custom": "val"},
	})
	if c.requestDelay != 100*time.Millisecond {
		t.Errorf("requestDelay = %v, want 100ms", c.requestDelay)
	}
	if c.maxRetries != 5 {
		t.Errorf("maxRetries = %d, want 5", c.maxRetries)
	}
	if len(c.userAgents) != 2 {
		t.Errorf("userAgents len = %d, want 2", len(c.userAgents))
	}
	if _, ok := c.extraHeaders["X-Custom"]; !ok {
		t.Error("extraHeaders missing X-Custom")
	}
}

func TestGet_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"hello":"world"}`))
	}))
	defer ts.Close()

	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})
	body, err := c.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"hello":"world"}` {
		t.Errorf("body = %q, want {\"hello\":\"world\"}", string(body))
	}
}

func TestGet_SetsUserAgent(t *testing.T) {
	var receivedUA string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedUA = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	uas := []string{"TestUA/1.0"}
	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1, UserAgents: uas})
	_, err := c.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedUA != "TestUA/1.0" {
		t.Errorf("User-Agent = %q, want TestUA/1.0", receivedUA)
	}
}

func TestGet_SetsExtraHeaders(t *testing.T) {
	var receivedHeader string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeader = r.Header.Get("X-Custom-Header")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	c := New("test", Options{
		RequestDelay: 1 * time.Millisecond,
		MaxRetries:   1,
		ExtraHeaders: map[string]string{"X-Custom-Header": "custom-value"},
	})
	_, err := c.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedHeader != "custom-value" {
		t.Errorf("X-Custom-Header = %q, want custom-value", receivedHeader)
	}
}

func TestGet_ExtraHeadersOverride(t *testing.T) {
	var receivedHeader string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeader = r.Header.Get("X-Override")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	c := New("test", Options{
		RequestDelay: 1 * time.Millisecond,
		MaxRetries:   1,
		ExtraHeaders: map[string]string{"X-Override": "default"},
	})
	// 调用时传入 extraHeaders 覆盖默认值
	_, err := c.Get(ts.URL, map[string]string{"X-Override": "overridden"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedHeader != "overridden" {
		t.Errorf("X-Override = %q, want overridden", receivedHeader)
	}
}

func TestGet_HTTP500_Retries(t *testing.T) {
	var attempts int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 2})
	_, err := c.Get(ts.URL)
	if err == nil {
		t.Fatal("expected error for HTTP 500, got nil")
	}
	if atomic.LoadInt32(&attempts) != 2 {
		t.Errorf("attempts = %d, want 2 (retries)", atomic.LoadInt32(&attempts))
	}
}

func TestGet_429_RetriesAndRateLimited(t *testing.T) {
	var attempts int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer ts.Close()

	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 2})
	_, err := c.Get(ts.URL)
	if err == nil {
		t.Fatal("expected error for 429, got nil")
	}
	// 重试耗尽后 Get 返回的限流错误消息包含"限流"关键字
	if !strings.Contains(err.Error(), "限流") {
		t.Errorf("error message = %q, want contains 限流", err.Error())
	}
	// 429 应重试 MaxRetries 次
	if atomic.LoadInt32(&attempts) != 2 {
		t.Errorf("attempts = %d, want 2", atomic.LoadInt32(&attempts))
	}
}

func TestGet_429_ThenSuccess(t *testing.T) {
	var attempts int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&attempts, 1)
		if count == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 3})
	body, err := c.Get(ts.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Errorf("body = %q, want {\"ok\":true}", string(body))
	}
}

func TestParseRetryAfter_IntegerSeconds(t *testing.T) {
	h := http.Header{}
	h.Set("Retry-After", "10")
	d := parseRetryAfter(h)
	if d != 10*time.Second {
		t.Errorf("parseRetryAfter(\"10\") = %v, want 10s", d)
	}
}

func TestParseRetryAfter_Empty(t *testing.T) {
	h := http.Header{}
	d := parseRetryAfter(h)
	if d != 5*time.Second {
		t.Errorf("parseRetryAfter(empty) = %v, want 5s (default)", d)
	}
}

func TestParseRetryAfter_Invalid(t *testing.T) {
	h := http.Header{}
	h.Set("Retry-After", "not-a-number")
	d := parseRetryAfter(h)
	if d != 5*time.Second {
		t.Errorf("parseRetryAfter(invalid) = %v, want 5s (default)", d)
	}
}

func TestParseRetryAfter_HTTPDate(t *testing.T) {
	h := http.Header{}
	// 未来的日期应返回正数 duration
	h.Set("Retry-After", "Wed, 21 Oct 2099 07:28:00 GMT")
	d := parseRetryAfter(h)
	if d <= 0 {
		t.Errorf("parseRetryAfter(future date) = %v, want positive duration", d)
	}
}

func TestThrottle_EnforcesDelay(t *testing.T) {
	c := New("test", Options{
		RequestDelay: 50 * time.Millisecond,
		MaxRetries:   1,
	})

	start := time.Now()
	c.throttle() // 第一次无延迟
	elapsed1 := time.Since(start)
	if elapsed1 > 30*time.Millisecond {
		t.Errorf("first throttle took %v, should be near-instant", elapsed1)
	}

	c.throttle() // 第二次应等待 50ms
	elapsed2 := time.Since(start)
	if elapsed2 < 40*time.Millisecond {
		t.Errorf("second throttle took %v, should be >= 40ms (requestDelay)", elapsed2)
	}
}

func TestRandomUA_ReturnsValidAgent(t *testing.T) {
	uas := []string{"UA1", "UA2", "UA3"}
	c := New("test", Options{UserAgents: uas, MaxRetries: 1})

	// 多次调用应返回列表中的某个 UA
	for i := 0; i < 10; i++ {
		ua := c.randomUA()
		found := false
		for _, valid := range uas {
			if ua == valid {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("randomUA() returned %q not in list %v", ua, uas)
		}
	}
}

func TestGet_Non200Status(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"not found"}`))
	}))
	defer ts.Close()

	c := New("test", Options{RequestDelay: 1 * time.Millisecond, MaxRetries: 1})
	_, err := c.Get(ts.URL)
	if err == nil {
		t.Fatal("expected error for 404, got nil")
	}
}

func TestGet_ConnectionError(t *testing.T) {
	// 使用一个不可达的端口
	c := New("test", Options{
		RequestDelay:   1 * time.Millisecond,
		MaxRetries:     1,
		ConnectTimeout: 100 * time.Millisecond,
		ReadTimeout:    100 * time.Millisecond,
	})
	_, err := c.Get("http://127.0.0.1:1/test")
	if err == nil {
		t.Fatal("expected error for connection refused, got nil")
	}
}

func TestMin(t *testing.T) {
	if min(3, 5) != 3 {
		t.Errorf("min(3,5) = %d, want 3", min(3, 5))
	}
	if min(5, 3) != 3 {
		t.Errorf("min(5,3) = %d, want 3", min(5, 3))
	}
	if min(0, 0) != 0 {
		t.Errorf("min(0,0) = %d, want 0", min(0, 0))
	}
}
