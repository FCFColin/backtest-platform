package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"data-fetcher/internal/observability"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	gosharedhttp "github.com/backtest/go-shared/http"
	gosharedlog "github.com/backtest/go-shared/log"
	gosharedmw "github.com/backtest/go-shared/middleware"
	"github.com/ulule/limiter/v3"
	mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
	"github.com/ulule/limiter/v3/drivers/store/memory"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

// ============================================================
// 主函数
// ============================================================

func main() {
	gosharedlog.InitDefault()

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
	r.Use(gosharedmw.SecurityHeadersMiddleware())
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

	gosharedhttp.StartPprofServerIfEnabled("127.0.0.1:6060")

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
	}

	gosharedhttp.RunServer(srv, 30*time.Second)
}
