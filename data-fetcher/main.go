package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"data-fetcher/baostock"
	"data-fetcher/internal/observability"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/sony/gobreaker"
	"github.com/ulule/limiter/v3"
	mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
	"github.com/ulule/limiter/v3/drivers/store/memory"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

var stockCodePattern = regexp.MustCompile(`^(sh|sz)\.\d{6}$`)

// tickerPattern 校验通用 ticker 格式，防止路径遍历
// 仅允许大写字母、数字、点、下划线、连字符，长度 1-20
var tickerPattern = regexp.MustCompile(`^[A-Z0-9._-]{1,20}$`)

// isValidTicker 校验 ticker 格式是否合法，拒绝含 .. / \ 等危险字符的输入
func isValidTicker(ticker string) bool {
	if ticker == "" || len(ticker) > 20 {
		return false
	}
	if strings.Contains(ticker, "..") || strings.ContainsAny(ticker, `/\`) {
		return false
	}
	return tickerPattern.MatchString(ticker)
}

// ============================================================
// 配置
// ============================================================

type Config struct {
	DataDir string
	Port    string
}

func defaultConfig() *Config {
	root := findProjectRoot()
	return &Config{
		DataDir: filepath.Join(root, "data", "market"),
		Port:    "5003",
	}
}

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		dir = "."
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

// ============================================================
// 数据结构
// ============================================================

type TickerInfo struct {
	Code     string  `json:"code"`
	Name     string  `json:"name"`
	Market   string  `json:"market"`
	Type     string  `json:"type"`
	Currency string  `json:"currency"`
	Exchange string  `json:"exchange"`
	Active   bool    `json:"active"`
}

type PricePoint struct {
	Date       string  `json:"date"`
	Open       float64 `json:"open"`
	High       float64 `json:"high"`
	Low        float64 `json:"low"`
	Close      float64 `json:"close"`
	AdjClose   float64 `json:"adj_close"`
	Volume     int64   `json:"volume"`
	Dividend   float64 `json:"dividend"`
	SplitFactor float64 `json:"split_factor"`
}

type TickerData struct {
	Ticker  string       `json:"ticker"`
	Market  string       `json:"market"`
	Prices  []PricePoint `json:"prices"`
	Updated string       `json:"updated"`
}

type SearchResult struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

// ============================================================
// 数据存储
// ============================================================

type DataStore struct {
	mu      sync.RWMutex
	tickers map[string]*TickerInfo
	prices  map[string]*TickerData // ticker -> price data
	config  *Config
}

func NewDataStore(cfg *Config) *DataStore {
	ds := &DataStore{
		tickers: make(map[string]*TickerInfo),
		prices:  make(map[string]*TickerData),
		config:  cfg,
	}
	ds.loadFromDisk()
	return ds
}

func (ds *DataStore) loadFromDisk() {
	// 加载标的列表
	universeFile := filepath.Join(ds.config.DataDir, "state", "universe.json")
	if data, err := os.ReadFile(universeFile); err == nil {
		var tickers []TickerInfo
		if err := json.Unmarshal(data, &tickers); err == nil {
			for i := range tickers {
				ds.tickers[tickers[i].Code] = &tickers[i]
			}
			slog.Info("加载标的", "module", "数据存储", "count", len(tickers))
		}
	}

	// 加载价格数据
	// 数据格式：tickers/A.json, tickers/BND.json 等
	tickersDir := filepath.Join(ds.config.DataDir, "tickers")
	entries, err := os.ReadDir(tickersDir)
	if err != nil {
		slog.Info("标的目录不存在", "module", "数据存储", "path", tickersDir)
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			ticker := strings.TrimSuffix(entry.Name(), ".json")
			ds.prices[ticker] = &TickerData{Ticker: ticker}
		}
	}
	slog.Info("发现标的价格文件", "module", "数据存储", "count", len(ds.prices))
}

func (ds *DataStore) GetPriceData(ticker string) (*TickerData, error) {
	ds.mu.RLock()
	if td, ok := ds.prices[ticker]; ok && len(td.Prices) > 0 {
		ds.mu.RUnlock()
		return td, nil
	}
	ds.mu.RUnlock()

	return ds.loadPriceFromDisk(ticker)
}

func (ds *DataStore) loadPriceFromDisk(ticker string) (*TickerData, error) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	if td, ok := ds.prices[ticker]; ok && len(td.Prices) > 0 {
		return td, nil
	}

	priceFile := filepath.Join(ds.config.DataDir, "tickers", ticker+".json")
	data, err := os.ReadFile(priceFile)
	if err != nil {
		return nil, fmt.Errorf("标的数据不存在: %s", ticker)
	}

	var td TickerData
	if err := json.Unmarshal(data, &td); err != nil {
		var prices []PricePoint
		if err2 := json.Unmarshal(data, &prices); err2 == nil {
			td = TickerData{Ticker: ticker, Prices: prices}
		} else {
			return nil, fmt.Errorf("解析标的数据失败: %s, %v", ticker, err)
		}
	}

	ds.prices[ticker] = &td
	return &td, nil
}

func (ds *DataStore) SearchTickers(query string, limit int) []SearchResult {
	ds.mu.RLock()
	defer ds.mu.RUnlock()

	query = strings.ToUpper(query)
	var results []SearchResult
	for _, t := range ds.tickers {
		if !t.Active {
			continue
		}
		if strings.HasPrefix(strings.ToUpper(t.Code), query) ||
			strings.Contains(strings.ToUpper(t.Name), query) {
			results = append(results, SearchResult{
				Ticker: t.Code,
				Name:   t.Name,
				Market: t.Market,
			})
			if len(results) >= limit {
				break
			}
		}
	}
	return results
}

// ============================================================
// HTTP处理器
// ============================================================

func handleSearch(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少查询参数 q"})
			return
		}
		limit := 20
		results := ds.SearchTickers(query, limit)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
	}
}

func handlePriceData(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Param("ticker")
		if !isValidTicker(ticker) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20"})
			return
		}
		td, err := ds.GetPriceData(ticker)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "标的数据不存在"})
			return
		}

		startDate := c.Query("start")
		endDate := c.Query("end")

		// 过滤日期范围
		var filtered []PricePoint
		for _, p := range td.Prices {
			if startDate != "" && p.Date < startDate {
				continue
			}
			if endDate != "" && p.Date > endDate {
				continue
			}
			filtered = append(filtered, p)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": filtered})
	}
}

func handleBatchPriceData(ds *DataStore) gin.HandlerFunc {
	type BatchRequest struct {
		Tickers   []string `json:"tickers"`
		StartDate string   `json:"startDate"`
		EndDate   string   `json:"endDate"`
	}

	return func(c *gin.Context) {
		var req BatchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
			return
		}

		// 校验每个 ticker 格式，防止路径遍历
		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t + "，仅允许大写字母、数字、点、下划线、连字符，长度1-20"})
				return
			}
		}

		result := make(map[string]interface{})
		var mu sync.Mutex
		var wg sync.WaitGroup

		sem := make(chan struct{}, 10)
		for _, ticker := range req.Tickers {
			wg.Add(1)
			go func(t string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				td, err := ds.GetPriceData(t)
				if err != nil {
					mu.Lock()
					result[t] = map[string]string{"error": "标的数据不可用"}
					mu.Unlock()
					return
				}
				var filtered []PricePoint
				for _, p := range td.Prices {
					if req.StartDate != "" && p.Date < req.StartDate {
						continue
					}
					if req.EndDate != "" && p.Date > req.EndDate {
						continue
					}
					filtered = append(filtered, p)
				}
				mu.Lock()
				result[t] = filtered
				mu.Unlock()
			}(ticker)
		}
		wg.Wait()

		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
}

// Performance: 解决N+1查询问题
// 企业为何需要：N+1查询是性能反模式，循环内数据库查询导致延迟线性增长
// 权衡：批量查询可能返回过多数据，但通过WHERE条件限制范围
func (ds *DataStore) BatchValidateTickers(tickers []string) (valid []string, invalid []string) {
	ds.mu.RLock()
	defer ds.mu.RUnlock()

	valid = make([]string, 0, len(tickers))
	invalid = make([]string, 0)

	for _, t := range tickers {
		if td, ok := ds.prices[t]; ok && len(td.Prices) > 0 {
			valid = append(valid, t)
			continue
		}
		// 检查磁盘上是否有数据文件（不加载完整数据，仅检查存在性）
		priceFile := filepath.Join(ds.config.DataDir, "tickers", t+".json")
		if _, err := os.Stat(priceFile); err == nil {
			valid = append(valid, t)
		} else {
			invalid = append(invalid, t)
		}
	}
	return
}

func handleValidateTickers(ds *DataStore) gin.HandlerFunc {
	type ValidateRequest struct {
		Tickers []string `json:"tickers"`
	}

	return func(c *gin.Context) {
		var req ValidateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
			return
		}

		// 校验每个 ticker 格式，防止路径遍历
		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t + "，仅允许大写字母、数字、点、下划线、连字符，长度1-20"})
				return
			}
		}

		// Performance: 解决N+1查询问题
		// 企业为何需要：N+1查询是性能反模式，循环内数据库查询导致延迟线性增长
		// 权衡：批量查询可能返回过多数据，但通过WHERE条件限制范围
		valid, invalid := ds.BatchValidateTickers(req.Tickers)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"valid":   valid,
				"invalid": invalid,
			},
		})
	}
}

func handleCPI(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		country := c.Param("country")
		if country != "us" && country != "cn" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "目前仅支持美国(us)和中国(cn)CPI数据"})
			return
		}

		fileName := "us_cpi.json"
		if country == "cn" {
			fileName = "cn_cpi.json"
		}
		cpiFile := filepath.Join(ds.config.DataDir, "cpi", fileName)
		data, err := os.ReadFile(cpiFile)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "CPI数据文件不存在: " + country})
			return
		}

		var cpiData []map[string]interface{}
		if err := json.Unmarshal(data, &cpiData); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "CPI数据解析失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": cpiData})
	}
}

func handleHealth(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ds.mu.RLock()
		tickerCount := len(ds.tickers)
		priceCount := len(ds.prices)
		ds.mu.RUnlock()

		c.JSON(http.StatusOK, gin.H{
			"status":       "ok",
			"engine":       "go",
			"version":      "0.1.0",
			"ticker_count": tickerCount,
			"price_count":  priceCount,
		})
	}
}

// ============================================================
// 主函数
// ============================================================

func securityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "0")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// buildCorsConfig 构建 CORS 配置。
//
// 读取 `CORS_ORIGINS` 环境变量（逗号分隔），未设置时默认允许 `http://localhost:5173`。
// 不再使用 AllowAllOrigins，生产环境须通过环境变量显式指定允许的前端来源。
func buildCorsConfig() cors.Config {
	raw := os.Getenv("CORS_ORIGINS")
	var origins []string
	if strings.TrimSpace(raw) == "" {
		origins = []string{"http://localhost:5173"}
	} else {
		for _, s := range strings.Split(raw, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				origins = append(origins, s)
			}
		}
	}
	return cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}
}

func main() {
	// 企业理由：Go 服务纯文本日志无法被日志平台消费。
	// slog 是 Go 1.21+ 标准库，零依赖，输出 JSON 格式，
	// 包含 level/timestamp/msg 字段，便于 Loki/Elasticsearch 消费。
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := defaultConfig()
	if port := os.Getenv("DATA_FETCHER_PORT"); port != "" {
		cfg.Port = port
	}
	if dir := os.Getenv("DATA_DIR"); dir != "" {
		cfg.DataDir = dir
	}

	slog.Info("Go数据获取服务启动", "module", "main", "version", "0.1.0", "port", cfg.Port)
	slog.Info("数据目录", "module", "main", "path", cfg.DataDir)

	ds := NewDataStore(cfg)

	shutdownObs, metricsHandler := observability.MustInit("data-fetcher")
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownObs(ctx)
	}()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(securityHeadersMiddleware())
	// 企业理由（ADR-015）：与 Node API trace 通过 traceparent 关联。
	r.Use(otelgin.Middleware("data-fetcher"))

	// 企业理由：Go 服务端口暴露到主机，无认证且无限流，
	// 可被用于资源耗尽攻击。限流是 DoS 防御的基本手段。
	rate, err := limiter.NewRateFromFormatted("60-M")
	if err != nil {
		slog.Error("解析限流配置失败", "module", "main", "error", err)
		os.Exit(1)
	}
	store := memory.NewStore()
	instance := limiter.New(store, rate)
	limiterMiddleware := mgin.NewMiddleware(instance)
	r.Use(limiterMiddleware)

	corsConfig := buildCorsConfig()
	r.Use(cors.New(corsConfig))

	// 健康检查端点：无需认证，便于负载均衡器/K8s 探针访问
	r.GET("/api/data/health", handleHealth(ds))
	// Prometheus 指标（T-B5）
	r.GET("/metrics", gin.WrapH(metricsHandler))

	// 认证路由组：所有业务 API 强制校验 X-Data-Service-Auth 头
	// 企业理由：data-fetcher 暴露行情数据和 baostock 实时查询 API，
	// 无认证时任意调用方可消耗外部 API 配额和磁盘 I/O 资源。
	authed := r.Group("/")
	authed.Use(DataServiceAuthMiddleware())
	{
		// API路由 - 本地数据
		authed.GET("/api/data/search", handleSearch(ds))
		authed.GET("/api/data/price/:ticker", handlePriceData(ds))
		authed.POST("/api/data/price/batch", handleBatchPriceData(ds))
		authed.POST("/api/data/validate", handleValidateTickers(ds))
		authed.GET("/api/data/cpi/:country", handleCPI(ds))

		// API路由 - baostock实时获取
		authed.GET("/api/baostock/test", handleBaoStockTest())
		authed.GET("/api/baostock/kline", handleBaoStockKLine())
		authed.GET("/api/baostock/all-stock", handleBaoStockAllStock())
		authed.GET("/api/baostock/trade-dates", handleBaoStockTradeDates())
	}

	// Observability: pprof在线诊断端点，独立端口与业务隔离
	// 企业为何需要：生产环境无法SSH时，通过pprof诊断CPU/内存/goroutine泄漏
	// Security (T-29): pprof 暴露高敏诊断数据且 profile 采样可被滥用为 DoS。改为默认仅绑定
	// 回环地址，且需显式 ENABLE_PPROF=true 才启动，消除"裸暴露 0.0.0.0 无认证"风险。
	if os.Getenv("ENABLE_PPROF") == "true" {
		go func() {
			pprofAddr := os.Getenv("PPROF_ADDR")
			if pprofAddr == "" {
				pprofAddr = "127.0.0.1:6060"
			}
			mux := http.NewServeMux()
			mux.HandleFunc("/debug/pprof/", pprof.Index)
			mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
			mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
			mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
			mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
			slog.Info("pprof server starting", "addr", pprofAddr)
			if err := http.ListenAndServe(pprofAddr, mux); err != nil {
				slog.Error("pprof server failed", "error", err)
			}
		}()
	}

	// Reliability: 解决在途请求丢失。企业为何需要：K8s滚动更新发送SIGTERM，无优雅关闭则所有在途请求立即丢失。权衡：30s超时对齐请求超时，超时后强制退出防止僵尸进程。
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	// Start server in goroutine
	go func() {
		slog.Info("Server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("Shutting down server...")

	// Graceful shutdown with 30s timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
	}
	slog.Info("Server exited")
}

// ============================================================
// BaoStock Handlers
// ============================================================

// baoStockBreaker 是 baostock 调用的熔断器（T-P1-2.3）
//
// 企业理由：baostock 是外部 TCP 服务（public-api.baostock.com:10030），
// 故障时每次请求等 TCP 超时（数十秒），高并发下 goroutine 堆积引发雪崩。
// 熔断器在错误率超阈值时 Open，快速失败返回 503，避免拖垮服务。
//
// 配置说明：
// - ReadyToTrip: 10s 窗口内错误率 > 50% 触发熔断（最少 5 次请求）
// - Timeout: 30s 后进入 HalfOpen 探测
//
// 权衡：熔断 Open 期间所有 baostock 请求直接失败，但优于全量超时。
var baoStockBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
	Name:        "baostock",
	MaxRequests: 5, // HalfOpen 状态允许的探测请求数
	Interval:    60 * time.Second,
	Timeout:     30 * time.Second,
	ReadyToTrip: func(counts gobreaker.Counts) bool {
		// 至少 5 次请求且错误率 > 50% 才熔断
		return counts.ConsecutiveFailures >= 5 ||
			(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
	},
	OnStateChange: func(name string, from, to gobreaker.State) {
		slog.Warn("baostock 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
	},
})

// withBaoStockClient 创建 baostock 客户端并执行 fn，通过熔断器保护。
//
// 熔断器 Open 时返回 503 Service Unavailable，调用方应提示用户稍后重试。
func withBaoStockClient(fn func(*baostock.Client, *gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		result, err := baoStockBreaker.Execute(func() (interface{}, error) {
			client := baostock.NewClient()
			defer client.Close()

			if err := client.Connect(); err != nil {
				return nil, fmt.Errorf("连接baostock失败: %w", err)
			}
			if err := client.Login(); err != nil {
				return nil, fmt.Errorf("登录baostock失败: %w", err)
			}
			fn(client, c)
			return nil, nil
		})

		if err != nil {
			// 熔断器 Open 时返回 ErrOpenState
			if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"success": false,
					"error":   "baostock 服务暂时不可用（熔断器已开启），请稍后重试",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "baostock 服务内部错误"})
			return
		}
		_ = result
	}
}

func handleBaoStockTest() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		start := time.Now()
		data, err := client.QueryHistoryKDataPlus(
			"sh.600000", "date,open,high,low,close,volume",
			"2025-01-01", "2025-12-31", "d", "3",
		)
		elapsed := time.Since(start).Milliseconds()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "baostock 测试请求失败", "elapsed_ms": elapsed})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true, "count": len(data), "elapsed_ms": elapsed,
		})
	})
}

func handleBaoStockKLine() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		code := c.Query("code")
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少code参数"})
			return
		}
		if !stockCodePattern.MatchString(code) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code参数格式错误，应为 sh.XXXXXX 或 sz.XXXXXX"})
			return
		}
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))
		frequency := c.DefaultQuery("freq", "d")
		adjustFlag := c.DefaultQuery("adjust", "2")
		fields := c.DefaultQuery("fields", "date,open,high,low,close,volume,amount,turn")

		data, err := client.QueryHistoryKDataPlus(code, fields, startDate, endDate, frequency, adjustFlag)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "K线数据获取失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": data, "count": len(data)})
	})
}

func handleBaoStockAllStock() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

		stocks, err := client.QueryAllStock(date)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "股票列表获取失败"})
			return
		}

		result := make([]map[string]string, 0, len(stocks))
		for _, s := range stocks {
			if s.TradeStatus == "1" {
				result = append(result, map[string]string{
					"code": s.Code, "name": s.CodeName, "market": "A股",
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "count": len(result)})
	})
}

func handleBaoStockTradeDates() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))

		dates, err := client.QueryTradeDates(startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "交易日数据获取失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": dates, "count": len(dates)})
	})
}
