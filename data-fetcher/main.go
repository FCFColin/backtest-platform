package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"data-fetcher/baostock"
	"data-fetcher/internal/observability"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sony/gobreaker"
	"github.com/ulule/limiter/v3"
	mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
	"github.com/ulule/limiter/v3/drivers/store/memory"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

var stockCodePattern = regexp.MustCompile(`^(sh|sz)\.\d{6}$`)

var tickerPattern = regexp.MustCompile(`^[A-Z0-9._-]{1,20}$`)

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
	Port        string
	DatabaseURL string
}

func defaultConfig() *Config {
	return &Config{
		Port:        "5003",
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
}

// ============================================================
// 数据结构
// ============================================================

type PricePoint struct {
	Date        string  `json:"date"`
	Open        float64 `json:"open"`
	High        float64 `json:"high"`
	Low         float64 `json:"low"`
	Close       float64 `json:"close"`
	AdjClose    float64 `json:"adj_close"`
	Volume      int64   `json:"volume"`
	Dividend    float64 `json:"dividend"`
	SplitFactor float64 `json:"split_factor"`
}

type SearchResult struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Market string `json:"market"`
}

// ============================================================
// 数据存储（PostgreSQL）
// ============================================================

type DataStore struct {
	pool *pgxpool.Pool
}

func NewDataStore(ctx context.Context, cfg *Config) (*DataStore, error) {
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 未设置")
	}
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("解析 DATABASE_URL 失败: %w", err)
	}
	poolCfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("数据库 Ping 失败: %w", err)
	}

	slog.Info("数据存储初始化完成", "module", "数据存储")
	return &DataStore{pool: pool}, nil
}

func (ds *DataStore) GetPriceData(ctx context.Context, ticker, startDate, endDate string) ([]PricePoint, error) {
	query := `SELECT date, open, high, low, close, volume, adj_close FROM prices WHERE ticker = $1`
	args := []interface{}{ticker}
	argIdx := 2

	if startDate != "" {
		query += fmt.Sprintf(" AND date >= $%d", argIdx)
		args = append(args, startDate)
		argIdx++
	}
	if endDate != "" {
		query += fmt.Sprintf(" AND date <= $%d", argIdx)
		args = append(args, endDate)
	}
	query += " ORDER BY date"

	rows, err := ds.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询价格数据失败: %w", err)
	}
	defer rows.Close()

	var prices []PricePoint
	for rows.Next() {
		var p PricePoint
		var date time.Time
		var adjClose *float64
		if err := rows.Scan(&date, &p.Open, &p.High, &p.Low, &p.Close, &p.Volume, &adjClose); err != nil {
			return nil, fmt.Errorf("扫描价格行失败: %w", err)
		}
		p.Date = date.Format("2006-01-02")
		if adjClose != nil {
			p.AdjClose = *adjClose
		}
		prices = append(prices, p)
	}

	if len(prices) == 0 {
		return nil, fmt.Errorf("标的数据不存在: %s", ticker)
	}
	return prices, nil
}

func (ds *DataStore) SearchTickers(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	rows, err := ds.pool.Query(ctx, `
		SELECT ticker, COALESCE(category, '') AS name, COALESCE(market, '') AS market
		FROM tickers
		WHERE ticker ILIKE $1 OR category ILIKE $1
		ORDER BY ticker
		LIMIT $2
	`, "%"+query+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("搜索标的失败: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.Ticker, &r.Name, &r.Market); err != nil {
			return nil, fmt.Errorf("扫描搜索结果失败: %w", err)
		}
		results = append(results, r)
	}
	return results, nil
}

func (ds *DataStore) BatchValidateTickers(ctx context.Context, tickers []string) (valid []string, invalid []string, err error) {
	if len(tickers) == 0 {
		return nil, nil, nil
	}

	rows, err := ds.pool.Query(ctx, `
		SELECT DISTINCT ticker FROM prices WHERE ticker = ANY($1)
	`, tickers)
	if err != nil {
		return nil, nil, fmt.Errorf("校验标的失败: %w", err)
	}
	defer rows.Close()

	validSet := make(map[string]bool, len(tickers))
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, nil, fmt.Errorf("扫描校验结果失败: %w", err)
		}
		validSet[t] = true
	}

	valid = make([]string, 0, len(tickers))
	invalid = make([]string, 0)
	for _, t := range tickers {
		if validSet[t] {
			valid = append(valid, t)
		} else {
			invalid = append(invalid, t)
		}
	}
	return
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
		results, err := ds.SearchTickers(c.Request.Context(), query, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "搜索失败: " + err.Error()})
			return
		}
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

		startDate := c.Query("start")
		endDate := c.Query("end")

		prices, err := ds.GetPriceData(c.Request.Context(), ticker, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "标的数据不存在"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
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

		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t})
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

				prices, err := ds.GetPriceData(c.Request.Context(), t, req.StartDate, req.EndDate)
				mu.Lock()
				if err != nil {
					result[t] = map[string]string{"error": "标的数据不可用"}
				} else {
					result[t] = prices
				}
				mu.Unlock()
			}(ticker)
		}
		wg.Wait()

		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
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

		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t})
				return
			}
		}

		valid, invalid, err := ds.BatchValidateTickers(c.Request.Context(), req.Tickers)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "校验失败"})
			return
		}

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

		rows, err := ds.pool.Query(c.Request.Context(), `
			SELECT date, value FROM cpi_data
			WHERE country = $1
			ORDER BY date
		`, strings.ToUpper(country))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询CPI数据失败"})
			return
		}
		defer rows.Close()

		type cpiEntry struct {
			Date  string  `json:"date"`
			Value float64 `json:"value"`
		}
		var cpiData []cpiEntry
		for rows.Next() {
			var e cpiEntry
			var date time.Time
			if err := rows.Scan(&date, &e.Value); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "解析CPI数据失败"})
				return
			}
			e.Date = date.Format("2006-01-02")
			cpiData = append(cpiData, e)
		}

		if len(cpiData) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "CPI数据不存在: " + country})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": cpiData})
	}
}

func handleHealth(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tickerCount, priceCount int
		if err := ds.pool.QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM tickers").Scan(&tickerCount); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"status":  "degraded",
				"engine":  "go",
				"version": "0.1.0",
				"error":   "查询标的数失败",
			})
			return
		}
		if err := ds.pool.QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM prices").Scan(&priceCount); err != nil {
			priceCount = 0
		}

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
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := defaultConfig()
	if port := os.Getenv("DATA_FETCHER_PORT"); port != "" {
		cfg.Port = port
	}

	slog.Info("Go数据获取服务启动", "module", "main", "version", "0.1.0", "port", cfg.Port)

	ctx := context.Background()
	ds, err := NewDataStore(ctx, cfg)
	if err != nil {
		slog.Error("数据存储初始化失败", "module", "main", "error", err)
		os.Exit(1)
	}
	defer ds.pool.Close()

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
	r.Use(otelgin.Middleware("data-fetcher"))

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

	r.GET("/api/data/health", handleHealth(ds))
	r.GET("/metrics", gin.WrapH(metricsHandler))

	authed := r.Group("/")
	authed.Use(DataServiceAuthMiddleware())
	{
		authed.GET("/api/data/search", handleSearch(ds))
		authed.GET("/api/data/price/:ticker", handlePriceData(ds))
		authed.POST("/api/data/price/batch", handleBatchPriceData(ds))
		authed.POST("/api/data/validate", handleValidateTickers(ds))
		authed.GET("/api/data/cpi/:country", handleCPI(ds))

		authed.GET("/api/baostock/test", handleBaoStockTest())
		authed.GET("/api/baostock/kline", handleBaoStockKLine())
		authed.GET("/api/baostock/all-stock", handleBaoStockAllStock())
		authed.GET("/api/baostock/trade-dates", handleBaoStockTradeDates())
	}

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

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		slog.Info("Server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("Shutting down server...")

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

var baoStockBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
	Name:        "baostock",
	MaxRequests: 5,
	Interval:    60 * time.Second,
	Timeout:     30 * time.Second,
	ReadyToTrip: func(counts gobreaker.Counts) bool {
		return counts.ConsecutiveFailures >= 5 ||
			(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
	},
	OnStateChange: func(name string, from, to gobreaker.State) {
		slog.Warn("baostock 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
	},
})

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
