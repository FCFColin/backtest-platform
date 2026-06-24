package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSearchTickers(t *testing.T) {
	ds := &DataStore{
		tickers: map[string]*TickerInfo{
			"VTI": {Code: "VTI", Name: "Vanguard Total Stock Market ETF", Market: "US", Active: true},
			"BND": {Code: "BND", Name: "Vanguard Total Bond Market ETF", Market: "US", Active: true},
		},
		prices: make(map[string]*TickerData),
		config: defaultConfig(),
	}

	results := ds.SearchTickers("Vanguard", 10)
	if len(results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(results))
	}

	results = ds.SearchTickers("VTI", 10)
	if len(results) != 1 {
		t.Errorf("Expected 1 result for VTI, got %d", len(results))
	}

	results = ds.SearchTickers("NONEXISTENT", 10)
	if len(results) != 0 {
		t.Errorf("Expected 0 results for nonexistent, got %d", len(results))
	}
}

func TestSearchTickersInactive(t *testing.T) {
	ds := &DataStore{
		tickers: map[string]*TickerInfo{
			"OLD": {Code: "OLD", Name: "Delisted", Market: "US", Active: false},
		},
		prices: make(map[string]*TickerData),
		config: defaultConfig(),
	}

	results := ds.SearchTickers("OLD", 10)
	if len(results) != 0 {
		t.Errorf("Inactive tickers should not appear in search, got %d", len(results))
	}
}

func TestLoadPriceFromDiskMissing(t *testing.T) {
	ds := &DataStore{
		prices: make(map[string]*TickerData),
		config: &Config{DataDir: "/nonexistent/path"},
	}

	_, err := ds.loadPriceFromDisk("FAKE")
	if err == nil {
		t.Error("Expected error for nonexistent ticker")
	}
}

func TestHealthHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ds := &DataStore{
		tickers: map[string]*TickerInfo{
			"VTI": {Code: "VTI", Active: true},
		},
		prices: map[string]*TickerData{
			"VTI": {Ticker: "VTI", Prices: []PricePoint{{Date: "2020-01-02", Close: 150}}},
		},
		config: defaultConfig(),
	}

	r := gin.New()
	r.GET("/health", handleHealth(ds))

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Health handler returned %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "ok" {
		t.Errorf("Health status = %v, want ok", resp["status"])
	}
	if resp["ticker_count"] != float64(1) {
		t.Errorf("ticker_count = %v, want 1", resp["ticker_count"])
	}
}

func TestSearchHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ds := &DataStore{
		tickers: map[string]*TickerInfo{
			"VTI": {Code: "VTI", Name: "Vanguard Total", Market: "US", Active: true},
		},
		prices: make(map[string]*TickerData),
		config: defaultConfig(),
	}

	r := gin.New()
	r.GET("/search", handleSearch(ds))

	req := httptest.NewRequest("GET", "/search?q=Vanguard", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Search handler returned %d", w.Code)
	}
}

func TestSearchHandlerMissingQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ds := &DataStore{
		tickers: make(map[string]*TickerInfo),
		prices:  make(map[string]*TickerData),
		config:  defaultConfig(),
	}

	r := gin.New()
	r.GET("/search", handleSearch(ds))

	req := httptest.NewRequest("GET", "/search", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Missing query should return 400, got %d", w.Code)
	}
}

func TestFindProjectRoot(t *testing.T) {
	root := findProjectRoot()
	if root == "" {
		t.Error("findProjectRoot should not return empty string")
	}
	pkgJson := filepath.Join(root, "package.json")
	if _, err := os.Stat(pkgJson); err != nil {
		t.Errorf("Root should contain package.json, got error: %v", err)
	}
}

func TestPricePointJSON(t *testing.T) {
	pp := PricePoint{
		Date:   "2020-01-02",
		Open:   100.0,
		High:   105.0,
		Low:    98.0,
		Close:  103.0,
		Volume: 1000000,
	}
	data, err := json.Marshal(pp)
	if err != nil {
		t.Fatalf("Failed to marshal PricePoint: %v", err)
	}
	var pp2 PricePoint
	if err := json.Unmarshal(data, &pp2); err != nil {
		t.Fatalf("Failed to unmarshal PricePoint: %v", err)
	}
	if pp2.Date != "2020-01-02" {
		t.Errorf("Date = %q, want 2020-01-02", pp2.Date)
	}
	if pp2.Close != 103.0 {
		t.Errorf("Close = %f, want 103.0", pp2.Close)
	}
}

// TestDataStoreConcurrentAccess 验证 DataStore 在并发读写下的线程安全性。
//
// 企业理由：Go 的并发是核心特性，DataStore 使用 sync.RWMutex 保护共享 map，
// 但锁的正确性必须通过 -race 检测器验证。数据竞争在生产环境会导致难以复现的
// 内存损坏（map concurrent write panic 是 Go 最常见的生产事故之一）。
// 此测试模拟多 goroutine 并发执行 SearchTickers（读锁）和 loadPriceFromDisk（写锁），
// 配合 CI 的 `go test -race` 检测潜在的数据竞争。
// 权衡：-race 使测试慢 2-10 倍，但只在 CI 跑，不影响开发体验。
func TestDataStoreConcurrentAccess(t *testing.T) {
	t.Parallel()

	ds := &DataStore{
		tickers: map[string]*TickerInfo{
			"VTI": {Code: "VTI", Name: "Vanguard Total Stock Market ETF", Market: "US", Active: true},
			"BND": {Code: "BND", Name: "Vanguard Total Bond Market ETF", Market: "US", Active: true},
			"SPY": {Code: "SPY", Name: "SPDR S&P 500 ETF", Market: "US", Active: true},
		},
		prices: map[string]*TickerData{
			"VTI": {Ticker: "VTI", Prices: []PricePoint{{Date: "2020-01-02", Close: 150}}},
		},
		config: &Config{DataDir: "/nonexistent/path"}, // loadPriceFromDisk 会失败但不影响竞态检测
	}

	const goroutines = 50
	const iterations = 100
	var wg sync.WaitGroup
	wg.Add(goroutines * 2)

	// 一半 goroutine 并发读（SearchTickers）
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				ds.SearchTickers("Vanguard", 10)
				ds.GetPriceData("VTI")
			}
		}()
	}

	// 一半 goroutine 并发写（loadPriceFromDisk 写 prices map）
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				// loadPriceFromDisk 会因路径不存在返回 error，但会尝试加写锁
				ds.loadPriceFromDisk("FAKE")
			}
		}()
	}

	wg.Wait()
	// 若存在数据竞争，-race 检测器会使测试失败并输出详细报告
}

func TestHandleValidateTickers_PathTraversal(t *testing.T) {
	// Security: 验证路径遍历攻击被阻止（CWE-22）
	// 企业为何需要：路径遍历是最常见的OWASP Top 10漏洞之一
	maliciousTickers := []string{
		"../../etc/passwd",
		"..%2F..%2Fetc%2Fpasswd",
		"/etc/passwd",
		`..\..\windows\system32\config\sam`,
		"..\\..\\etc\\passwd",
	}
	for _, ticker := range maliciousTickers {
		if isValidTicker(ticker) {
			t.Errorf("isValidTicker(%q) = true, expected false (path traversal)", ticker)
		}
	}
}

// ============================================================
// 基准测试
// ============================================================

// newBenchDataStore 创建用于基准测试的 DataStore，预填充 50 个 ticker 和价格数据。
//
// 企业理由：基准测试需要可重复的、接近生产规模的数据集。
// 50 个 ticker × 252 个交易日 = 12,600 个价格点，覆盖典型批量查询场景。
func newBenchDataStore() *DataStore {
	tickers := make(map[string]*TickerInfo, 50)
	prices := make(map[string]*TickerData, 50)

	for i := 0; i < 50; i++ {
		code := string(rune('A' + i%26)) + string(rune('A' + i/26))
		tickers[code] = &TickerInfo{
			Code:   code,
			Name:   "Benchmark Ticker " + code,
			Market: "US",
			Active: true,
		}
		pts := make([]PricePoint, 252)
		for d := 0; d < 252; d++ {
			pts[d] = PricePoint{
				Date:   "2024-01-01",
				Close:  100.0 + float64(d)*0.1,
				Open:   99.0 + float64(d)*0.1,
				High:   101.0 + float64(d)*0.1,
				Low:    98.0 + float64(d)*0.1,
				Volume: 1000000,
			}
		}
		prices[code] = &TickerData{Ticker: code, Prices: pts}
	}

	return &DataStore{
		tickers: tickers,
		prices:  prices,
		config:  defaultConfig(),
	}
}

// BenchmarkHandleBatch 基准测试批量价格查询处理器
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：无基准则无法判断优化效果，性能回归无法检测
// 权衡：基准测试增加CI时间约30秒，但防止性能退化
func BenchmarkHandleBatch(b *testing.B) {
	gin.SetMode(gin.TestMode)
	ds := newBenchDataStore()

	r := gin.New()
	r.POST("/api/data/price/batch", handleBatchPriceData(ds))

	// 构造批量请求：10个ticker
	reqBody, _ := json.Marshal(map[string]interface{}{
		"tickers":   []string{"AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ"},
		"startDate": "2024-01-01",
		"endDate":   "2024-12-31",
	})

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("POST", "/api/data/price/batch", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}
}

// BenchmarkHandleValidateTickers 基准测试 ticker 校验处理器
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：无基准则无法判断优化效果，性能回归无法检测
// 权衡：基准测试增加CI时间约30秒，但防止性能退化
func BenchmarkHandleValidateTickers(b *testing.B) {
	gin.SetMode(gin.TestMode)
	ds := newBenchDataStore()

	r := gin.New()
	r.POST("/api/data/validate", handleValidateTickers(ds))

	// 构造校验请求：10个ticker（5个有效 + 5个无效）
	reqBody, _ := json.Marshal(map[string]interface{}{
		"tickers": []string{"AA", "AB", "AC", "AD", "AE", "INVALID1", "INVALID2", "INVALID3", "INVALID4", "INVALID5"},
	})

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("POST", "/api/data/validate", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}
}

// BenchmarkSearchTickers 基准测试内存搜索操作
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：搜索是高频操作，性能退化直接影响用户体验
// 权衡：基准测试增加CI时间约10秒，但防止搜索性能退化
func BenchmarkSearchTickers(b *testing.B) {
	ds := newBenchDataStore()

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		ds.SearchTickers("A", 10)
	}
}

// BenchmarkIsValidTicker 基准测试 ticker 格式校验
//
// Performance: 基准测试，量化核心操作性能
// 企业为何需要：ticker 校验是每个请求的必经路径，性能退化直接影响吞吐
func BenchmarkIsValidTicker(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		isValidTicker("VTI")
	}
}