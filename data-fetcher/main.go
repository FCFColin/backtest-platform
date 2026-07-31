package main
import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "strings"
    "time"
    gosharedhttp "github.com/backtest/go-shared/http"
    gosharedlog "github.com/backtest/go-shared/log"
    gosharedmw "github.com/backtest/go-shared/middleware"
    "github.com/backtest/go-shared/observability"
    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
    "github.com/ulule/limiter/v3"
    mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
    "github.com/ulule/limiter/v3/drivers/store/memory"
    "go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
    "data-fetcher/internal/akshare"
    "data-fetcher/internal/finnhub"
    "data-fetcher/internal/handlers"
    "data-fetcher/internal/middleware"
    "data-fetcher/internal/provider"
    "data-fetcher/internal/store"
    "data-fetcher/internal/twelvedata"
    "data-fetcher/internal/yfinance"
)
func newRegistry() *provider.Registry {
	prio := os.Getenv("DATA_PROVIDER_PRIORITY")
	var priorities []string
	if prio != "" {
		priorities = strings.Split(prio, ",")
	} else {
		priorities = []string{"yfinance", "finnhub", "twelvedata", "akshare"}
	}
	reg := provider.NewRegistry(priorities)
	for _, p := range []provider.Provider{
		yfinance.NewProvider(),
		finnhub.NewProvider(),
		twelvedata.NewProvider(),
		akshare.NewProvider(),
	} {
if p != nil { reg.Register(p) }
	}
	return reg
}
type Config struct {
	Port        string
	DatabaseURL string
}
func newDefaultConfig() *Config {
	return &Config{ Port:        "5003", DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")), }
}
func main() {
	gosharedlog.InitDefault()
	cfg := newDefaultConfig()
if port := os.Getenv("DATA_FETCHER_PORT"); port != "" { cfg.Port = port }
	slog.Info("Go数据获取服务启动", "module", "main", "version", "0.1.0", "port", cfg.Port)
	ctx := context.Background()
	reg := newRegistry()
	ds, err := store.New(ctx, cfg.DatabaseURL, reg)
	if err != nil {
		slog.Error("数据存储初始化失败", "module", "main", "error", err)
		os.Exit(1)
	}
	defer ds.Pool().Close()
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
	limiterStore := memory.NewStore()
	instance := limiter.New(limiterStore, rate)
	limiterMiddleware := mgin.NewMiddleware(instance)
	r.Use(limiterMiddleware)
	corsConfig := middleware.BuildCorsConfig()
	r.Use(cors.New(corsConfig))
	r.GET("/api/data/health", handlers.HandleHealth(ds))
	r.GET("/api/ready", handlers.HandleReady(ds.Pool()))
	r.GET("/metrics", gin.WrapH(metricsHandler))
	authed := r.Group("/")
	authed.Use(gosharedmw.SharedTokenAuthMiddleware(
		"X-Data-Service-Auth",
		"DATA_SERVICE_AUTH_TOKEN",
		"missing X-Data-Service-Auth header",
		"no DATA_SERVICE_AUTH_TOKEN configured",
	))
	{
		authed.GET("/api/data/search", handlers.HandleSearch(ds))
		authed.GET("/api/data/price/:ticker", handlers.HandlePriceData(ds))
		authed.POST("/api/data/price/batch", handlers.HandleBatchPriceData(ds))
		authed.POST("/api/data/validate", handlers.HandleValidateTickers(ds))
		authed.GET("/api/data/cpi/:country", handlers.HandleCPI(ds))
		authed.GET("/api/baostock/test", handlers.HandleBaoStockTest())
		authed.GET("/api/baostock/kline", handlers.HandleBaoStockKLine())
		authed.GET("/api/baostock/all-stock", handlers.HandleBaoStockAllStock())
		authed.GET("/api/baostock/trade-dates", handlers.HandleBaoStockTradeDates())
	}
	gosharedhttp.StartPprofServerIfEnabled("127.0.0.1:6060")
	srv := &http.Server{
		Addr: ":" + cfg.Port, Handler: r, ReadTimeout: 30 * time.Second,
		WriteTimeout: 60 * time.Second, ReadHeaderTimeout: 10 * time.Second,
	}
	gosharedhttp.RunServer(srv, 30*time.Second)
}
