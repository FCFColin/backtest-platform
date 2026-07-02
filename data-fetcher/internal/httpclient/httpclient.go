package httpclient

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/http/cookiejar"
	"strconv"
	"sync"
	"time"
)

var errRateLimited = errors.New("rate limited")

func IsRateLimited(err error) bool {
	return errors.Is(err, errRateLimited)
}

type Options struct {
	RequestDelay   time.Duration
	UserAgents     []string
	ConnectTimeout time.Duration
	ReadTimeout    time.Duration
	MaxRetries     int
	ExtraHeaders   map[string]string
}

type Client struct {
	serviceName  string
	httpClient   *http.Client
	requestDelay time.Duration
	userAgents   []string
	maxRetries   int
	extraHeaders map[string]string
	lastReqTime  time.Time
	reqMu        sync.Mutex
}

func New(serviceName string, opts Options) *Client {
	if opts.ConnectTimeout == 0 {
		opts.ConnectTimeout = 10 * time.Second
	}
	if opts.ReadTimeout == 0 {
		opts.ReadTimeout = 30 * time.Second
	}
	if opts.RequestDelay == 0 {
		opts.RequestDelay = 500 * time.Millisecond
	}
	if opts.MaxRetries == 0 {
		opts.MaxRetries = 3
	}
	if len(opts.UserAgents) == 0 {
		opts.UserAgents = []string{
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
		}
	}

	client := &http.Client{Timeout: opts.ConnectTimeout + opts.ReadTimeout}
	if jar, err := cookiejar.New(nil); err == nil {
		client.Jar = jar
	}

	return &Client{
		serviceName:  serviceName,
		httpClient:   client,
		requestDelay: opts.RequestDelay,
		userAgents:   opts.UserAgents,
		maxRetries:   opts.MaxRetries,
		extraHeaders: opts.ExtraHeaders,
	}
}

func (c *Client) randomUA() string {
	return c.userAgents[rand.IntN(len(c.userAgents))]
}

func (c *Client) throttle() {
	c.reqMu.Lock()
	defer c.reqMu.Unlock()
	elapsed := time.Since(c.lastReqTime)
	if elapsed < c.requestDelay {
		time.Sleep(c.requestDelay - elapsed)
	}
	c.lastReqTime = time.Now()
}

func parseRetryAfter(headers http.Header) time.Duration {
	ra := headers.Get("Retry-After")
	if ra == "" {
		return 5 * time.Second
	}
	if seconds, err := strconv.Atoi(ra); err == nil {
		return time.Duration(seconds) * time.Second
	}
	if t, err := time.Parse(time.RFC1123, ra); err == nil {
		d := time.Until(t)
		if d > 0 {
			return d
		}
	}
	return 5 * time.Second
}

// Get 执行带节流、UA 轮换、429 处理、重试的 HTTP GET 请求。
// extraHeaders 中的键值对会覆盖请求头，优先级高于 Options 中的 ExtraHeaders。
func (c *Client) Get(url string, extraHeaders ...map[string]string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt < c.maxRetries; attempt++ {
		if attempt > 0 {
			base := time.Duration(attempt*attempt) * time.Second
			jitter := time.Duration(rand.Int64N(int64(base)/2 + 1))
			slog.Info(c.serviceName+" 重试", "attempt", attempt+1, "backoff_ms", (base+jitter).Milliseconds())
			time.Sleep(base + jitter)
		}

		body, err := c.doGet(url, extraHeaders...)
		if err != nil {
			lastErr = err
			if errors.Is(err, errRateLimited) {
				continue
			}
			continue
		}
		return body, nil
	}

	if errors.Is(lastErr, errRateLimited) {
		return nil, fmt.Errorf("%s 限流，重试 %d 次后仍失败", c.serviceName, c.maxRetries)
	}
	return nil, fmt.Errorf("%s 重试 %d 次后仍失败: %w", c.serviceName, c.maxRetries, lastErr)
}

func (c *Client) doGet(url string, extraHeaders ...map[string]string) ([]byte, error) {
	c.throttle()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", c.randomUA())
	}
	for k, v := range c.extraHeaders {
		if req.Header.Get(k) == "" {
			req.Header.Set(k, v)
		}
	}
	if len(extraHeaders) > 0 {
		for k, v := range extraHeaders[0] {
			req.Header.Set(k, v)
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP 请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应体失败: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := parseRetryAfter(resp.Header)
		slog.Warn(c.serviceName+" 429 限流", "retry_after_s", retryAfter.Seconds())
		time.Sleep(retryAfter)
		return nil, errRateLimited
	}

	if resp.StatusCode != http.StatusOK {
		snippet := string(body[:min(len(body), 200)])
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, snippet)
	}

	return body, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
