package httpclient

import (
	"errors"
	"fmt"
	"github.com/sony/gobreaker"
	"io"
	"log/slog"
	"math/rand/v2"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strconv"
	"sync"
	"time"
)

var (
	errRateLimited = errors.New("rate limited")
	errClientError = errors.New("client error")
)

var DefaultUserAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
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
	client := &http.Client{
		Timeout:   opts.ConnectTimeout + opts.ReadTimeout,
		Transport: &http.Transport{DialContext: (&net.Dialer{Timeout: opts.ConnectTimeout}).DialContext},
	}
	if jar, err := cookiejar.New(nil); err == nil {
		client.Jar = jar
	}
	return &Client{
		serviceName: serviceName, httpClient: client, requestDelay: opts.RequestDelay,
		userAgents: opts.UserAgents, maxRetries: opts.MaxRetries, extraHeaders: opts.ExtraHeaders,
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
func (c *Client) Get(url string, extraHeaders ...map[string]string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt < c.maxRetries; attempt++ {
		// 429 已在 doGet 内按 Retry-After 等待，跳过外层退避避免双重等待
		if attempt > 0 && !errors.Is(lastErr, errRateLimited) {
			base := time.Duration(attempt*attempt) * time.Second
			jitter := time.Duration(rand.Int64N(int64(base)/2 + 1))
			slog.Info(c.serviceName+" 重试", "attempt", attempt+1, "backoff_ms", (base + jitter).Milliseconds())
			time.Sleep(base + jitter)
		}
		body, err := c.doGet(url, extraHeaders...)
		if err != nil {
			lastErr = err
			if errors.Is(err, errClientError) {
				break
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
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return nil, fmt.Errorf("%w: HTTP %d: %s", errClientError, resp.StatusCode, snippet)
		}
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, snippet)
	}
	return body, nil
}
func DoGetWithBreaker[T any](
	breaker *gobreaker.CircuitBreaker,
	client *Client,
	url string,
	headers map[string]string,
	parse func([]byte) (T, error),
) (T, error) {
	var zero T
	if breaker == nil {
		body, err := client.Get(url, headers)
		if err != nil {
			return zero, err
		}
		return parse(body)
	}
	result, err := breaker.Execute(func() (interface{}, error) {
		body, err := client.Get(url, headers)
		if err != nil {
			return nil, err
		}
		return parse(body)
	})
	if err != nil {
		return zero, err
	}
	parsed, ok := result.(T)
	if !ok {
		return zero, fmt.Errorf("DoGetWithBreaker: unexpected result type %T", result)
	}
	return parsed, nil
}
