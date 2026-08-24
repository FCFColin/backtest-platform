package server

import (
	"context"
	"engine-go/internal/analysis"
	"engine-go/internal/calculators"
	"engine-go/internal/engine"
	"engine-go/internal/engine/tactical"
	"engine-go/internal/engineutil"
	"engine-go/internal/goaloptimizer"
	"engine-go/internal/middleware"
	"engine-go/internal/montecarlo"
	"engine-go/internal/optimizer"
	"engine-go/internal/signal"
	"engine-go/internal/version"
	"errors"
	sharedhttp "github.com/backtest/go-shared/http"
	gosharedmw "github.com/backtest/go-shared/middleware"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"time"
)

func withComputeSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return otel.Tracer("engine-go").Start(ctx, name, trace.WithAttributes(attrs...))
}
func okJSON(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}
func withComputeHandler[T any](c *gin.Context, errMsg, spanName string, fn func(ctx context.Context) (T, error)) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("计算处理器 panic", "path", c.Request.URL.Path, "panic", r)
			sharedhttp.NewProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
		}
	}()
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()
	if spanName != "" {
		var span trace.Span
		ctx, span = withComputeSpan(ctx, spanName)
		defer span.End()
	}
	result, err := fn(ctx)
	if err == nil {
		okJSON(c, result)
		return
	}
	var inputErr *engineutil.InputError
	switch {
	case errors.As(err, &inputErr):
		sharedhttp.NewProblem(c, http.StatusBadRequest, "COMPUTE_INPUT_ERROR", "Bad Request", inputErr.Error())
	case errors.Is(err, context.DeadlineExceeded):
		c.Header("Retry-After", "5")
		sharedhttp.NewProblem(c, http.StatusServiceUnavailable, "COMPUTE_TIMEOUT", "Computation Timeout", errMsg)
	default:
		slog.Error("计算处理器失败", "path", c.Request.URL.Path, "error", err)
		sharedhttp.NewProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
	}
}

func bindJSON[T any](c *gin.Context, code, msg string, req *T) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		sharedhttp.NewProblem(c, http.StatusBadRequest, code, "Bad Request", msg)
		return false
	}
	return true
}

func bindCompute[T any, R any](c *gin.Context, code, bindMsg, errMsg, spanName string, validate func(T) (string, string), fn func(context.Context, T) (R, error)) {
	var req T
	if !bindJSON(c, code, bindMsg, &req) {
		return
	}
	if validate != nil {
		if vcode, vmsg := validate(req); vcode != "" {
			sharedhttp.NewProblem(c, http.StatusBadRequest, vcode, "Bad Request", vmsg)
			return
		}
	}
	run := func(ctx context.Context) (R, error) { return fn(ctx, req) }
	withComputeHandler(c, errMsg, spanName, run)
}

var maxGoroutinesForHealth = envInt("ENGINE_MAX_GOROUTINES", 10000)

// computeSemaphore 全局计算并发上限：限流仅按 IP 生效，多 IP 并发需此护栏防 CPU 耗尽。
var computeSemaphore = make(chan struct{}, envInt("ENGINE_MAX_CONCURRENCY", 16))

func envInt(key string, def int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil && n > 0 {
		return n
	}
	return def
}

func computeConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		select {
		case computeSemaphore <- struct{}{}:
			defer func() { <-computeSemaphore }()
			c.Next()
		default:
			c.Header("Retry-After", "30")
			sharedhttp.NewProblem(c, http.StatusServiceUnavailable, "COMPUTE_OVERLOAD", "Computation Overloaded", "并发计算请求已满，请稍后重试")
			c.Abort()
		}
	}
}

func handleHealth(c *gin.Context) {
	goroutines := runtime.NumGoroutine()
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	resp := gin.H{"engine": "go", "version": version.String, "goroutines": goroutines, "status": "ok"}
	if goroutines > maxGoroutinesForHealth {
		resp["status"], resp["reason"] = "unhealthy", "goroutine count exceeds threshold"
		resp["threshold"] = maxGoroutinesForHealth
		c.JSON(http.StatusServiceUnavailable, resp)
		return
	}
	resp["heap_alloc"], resp["heap_sys"] = memStats.HeapAlloc, memStats.HeapSys
	c.JSON(http.StatusOK, resp)
}
func handleReady(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ready", "engine": "go"}) }

func mkCompute[T any, R any](code, bindMsg, errMsg, spanName string, validate func(T) (string, string), fn func(context.Context, T) (R, error)) gin.HandlerFunc {
	return func(c *gin.Context) { bindCompute(c, code, bindMsg, errMsg, spanName, validate, fn) }
}

var (
	handleBacktest = mkCompute("BACKTEST_BAD_REQUEST", "请求解析失败", "回测计算失败", "backtest.run",
		func(req engine.BacktestRequest) (string, string) {
			if len(req.Portfolios) == 0 {
				return "BACKTEST_EMPTY_PORTFOLIOS", "portfolios 不能为空"
			}
			if req.PriceData == nil {
				return "BACKTEST_EMPTY_PRICE_DATA", "priceData 不能为空"
			}
			return "", ""
		}, engine.RunBacktest)
	handleAnalysis = mkCompute("ANALYSIS_BAD_REQUEST", "请求格式错误", "分析计算失败", "",
		func(req analysis.AnalysisRequest) (string, string) {
			if len(req.Tickers) == 0 {
				return "ANALYSIS_EMPTY_TICKERS", "tickers 不能为空"
			}
			if req.PriceData == nil {
				return "ANALYSIS_EMPTY_PRICE_DATA", "priceData 不能为空"
			}
			for _, t := range req.Tickers {
				if _, ok := req.PriceData[t]; !ok {
					return "ANALYSIS_TICKER_NOT_FOUND", "ticker 在 priceData 中不存在"
				}
			}
			return "", ""
		}, analysis.RunAnalysis)
	handlePCA = mkCompute("PCA_BAD_REQUEST", "请求解析失败", "PCA 计算失败", "pca.compute",
		func(req analysis.PCARequest) (string, string) {
			if len(req.Tickers) < 2 {
				return "PCA_INSUFFICIENT_TICKERS", "至少需要 2 个 ticker"
			}
			return "", ""
		},
		func(_ context.Context, req analysis.PCARequest) (*analysis.PCAResult, error) {
			return analysis.PerformPCA(req)
		})
	handleOptimize           = mkCompute("OPTIMIZE_BAD_REQUEST", "请求解析失败", "优化计算失败", "optimizer.optimize", nil, optimizer.Optimize)
	handleEfficientFrontier  = mkCompute("FRONTIER_BAD_REQUEST", "请求解析失败", "有效前沿计算失败", "", nil, optimizer.ComputeEfficientFrontier)
	handleMonteCarlo         = mkCompute("MONTE_CARLO_BAD_REQUEST", "请求解析失败", "蒙特卡洛模拟失败", "montecarlo.simulate", nil, montecarlo.RunMonteCarlo)
	handleGoalOptimize       = mkCompute("GOAL_BAD_REQUEST", "请求解析失败", "目标优化计算失败", "", nil, goaloptimizer.OptimizeGoals)
	handleTacticalBacktest   = mkCompute("TACTICAL_BAD_REQUEST", "请求解析失败", "战术回测计算失败", "", nil, tactical.RunTacticalBacktest)
	handleTacticalGridSearch = mkCompute("GRID_BAD_REQUEST", "请求解析失败", "网格搜索计算失败", "", nil, tactical.RunGridSearch)
	handleFactorRegression   = mkCompute("FR_BAD_REQUEST", "请求解析失败", "因子回归计算失败", "", nil,
		func(_ context.Context, req analysis.FactorRegressionRequest) (*analysis.RegressionResult, error) {
			return analysis.RunRegression(req)
		})
)

func handleLETFAnalyze(c *gin.Context) {
	var req struct {
		LETFTicker      string                        `json:"letfTicker"`
		BenchmarkTicker string                        `json:"benchmarkTicker"`
		Leverage        float64                       `json:"leverage"`
		PriceData       map[string]map[string]float64 `json:"priceData"`
	}
	if !bindJSON(c, "LETF_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	letfData, ok1 := req.PriceData[req.LETFTicker]
	benchData, ok2 := req.PriceData[req.BenchmarkTicker]
	if !ok1 || !ok2 {
		sharedhttp.NewProblem(c, http.StatusBadRequest, "LETF_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
		return
	}
	if req.Leverage <= 0 || req.Leverage > 10 {
		sharedhttp.NewProblem(c, http.StatusBadRequest, "LETF_INVALID_LEVERAGE", "Bad Request", "leverage 必须在 (0, 10] 区间")
		return
	}
	withComputeHandler(c, "LETF 滑点分析失败", "", func(ctx context.Context) (*analysis.LETFResult, error) {
		return analysis.AnalyzeSlippage(analysis.LETFRequest{LETFSeries: engineutil.ToPricePoints(letfData), BenchSeries: engineutil.ToPricePoints(benchData), Leverage: req.Leverage})
	})
}
func handleCalculators(c *gin.Context) {
	var req struct {
		Type     string                              `json:"type"`
		CAGR     *calculators.CAGRRequest            `json:"cagr,omitempty"`
		SWR      *calculators.SWRRequest             `json:"swr,omitempty"`
		Frontier *calculators.TwoFundFrontierRequest `json:"frontier,omitempty"`
	}
	if !bindJSON(c, "CALC_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	withComputeHandler(c, "计算器计算失败", "", func(_ context.Context) (any, error) {
		switch req.Type {
		case "cagr":
			if req.CAGR == nil {
				return nil, engineutil.NewInputError("cagr 类型需要 cagr 参数")
			}
			return calculators.CalcCAGR(*req.CAGR), nil
		case "swr":
			if req.SWR == nil {
				return nil, engineutil.NewInputError("swr 类型需要 swr 参数")
			}
			return calculators.CalcSWR(*req.SWR), nil
		case "frontier":
			if req.Frontier == nil {
				return nil, engineutil.NewInputError("frontier 类型需要 frontier 参数")
			}
			return calculators.CalcTwoFundFrontier(*req.Frontier), nil
		default:
			return nil, engineutil.NewInputError("type 必须是 cagr/swr/frontier")
		}
	})
}

func handleSignalAnalyze(c *gin.Context) {
	// 与 withComputeHandler 契约对齐：panic → RFC9457 500（全局 Recovery 仅裸 500）
	defer func() {
		if r := recover(); r != nil {
			slog.Error("signal panic", "path", c.Request.URL.Path, "panic", r)
			sharedhttp.NewProblem(c, http.StatusInternalServerError, "SIGNAL_INTERNAL", "Internal Error", "信号分析内部错误")
		}
	}()
	var req struct {
		Mode      string                        `json:"mode"`
		Single    *signal.SignalAnalysisRequest `json:"single,omitempty"`
		Dual      *signal.DualSignalConfig      `json:"dual,omitempty"`
		Multi     *signal.MultiSignalConfig     `json:"multi,omitempty"`
		PriceData map[string]map[string]float64 `json:"priceData"`
	}
	if !bindJSON(c, "SIGNAL_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()
	bad := func(code, msg string) { sharedhttp.NewProblem(c, http.StatusBadRequest, code, "Bad Request", msg) }
	getTd := func(ticker string) (map[string]float64, bool) {
		td, ok := req.PriceData[ticker]
		if !ok {
			bad("SIGNAL_TICKER_NOT_FOUND", "ticker 在 priceData 中不存在")
		}
		return td, ok
	}
	switch req.Mode {
	case "single":
		if req.Single == nil {
			bad("SIGNAL_MISSING_SINGLE", "single 模式需要 single 参数")
			return
		}
		if td, ok := getTd(req.Single.Ticker); ok {
			okJSON(c, signal.AnalyzeSignal(*req.Single, engineutil.ToPricePoints(td)))
		}
	case "dual":
		if req.Dual == nil {
			bad("SIGNAL_MISSING_DUAL", "dual 模式需要 dual 参数")
			return
		}
		td1, ok1 := getTd(req.Dual.Signal1.Ticker)
		td2, ok2 := getTd(req.Dual.Signal2.Ticker)
		if !ok1 || !ok2 {
			return
		}
		okJSON(c, signal.AnalyzeDualSignal(req.Dual.Signal1, req.Dual.Signal2, engineutil.ToPricePoints(td1), engineutil.ToPricePoints(td2), req.Dual.CombinationMethod))
	case "multi":
		if req.Multi == nil || len(req.Multi.Signals) == 0 {
			bad("SIGNAL_MISSING_MULTI", "multi 模式需要 multi.signals 参数")
			return
		}
		if td, ok := getTd(req.Multi.Signals[0].Ticker); ok {
			okJSON(c, signal.AnalyzeMultiSignal(ctx, req.Multi.Signals, engineutil.ToPricePoints(td), req.Multi.AggregationMethod, req.Multi.Weights))
		}
	default:
		bad("SIGNAL_INVALID_MODE", "mode 必须是 single/dual/multi")
	}
}

const computeTimeout = 90 * time.Second

// maxBodyBytes 计算负载上限（priceData 通常 <1MB，10MB 足够且防超大 payload 拖垮解码）。
const maxBodyBytes = 10 << 20

func SetupRouter(metricsHandler http.Handler) *gin.Engine {
	r := gin.New()
	r.SetTrustedProxies(nil) // 不信任任何代理：ClientIP 取真实远端地址，XFF 无法伪造限流桶
	r.Use(gin.Recovery(), gosharedmw.SecurityHeadersMiddleware(), otelgin.Middleware("engine-go"))
	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		c.Next()
	})
	r.GET("/api/engine/health", handleHealth)
	r.GET("/api/ready", handleReady)
	if metricsHandler != nil {
		r.GET("/metrics", gin.WrapH(metricsHandler))
	}
	authed := r.Group("/")
	authed.Use(gosharedmw.SharedTokenAuthMiddleware("X-Engine-Auth", "ENGINE_AUTH_TOKEN", "missing X-Engine-Auth header", "no ENGINE_AUTH_TOKEN configured"), middleware.RateLimitMiddleware(0.5, 30), computeConcurrencyLimit())
	authed.POST("/api/engine/backtest", handleBacktest)
	authed.POST("/api/engine/analysis", handleAnalysis)
	authed.POST("/api/engine/optimize", handleOptimize)
	authed.POST("/api/engine/efficient-frontier", handleEfficientFrontier)
	authed.POST("/api/engine/monte-carlo", handleMonteCarlo)
	authed.POST("/api/engine/signal-analyze", handleSignalAnalyze)
	authed.POST("/api/engine/pca", handlePCA)
	authed.POST("/api/engine/letf-analyze", handleLETFAnalyze)
	authed.POST("/api/engine/goal-optimize", handleGoalOptimize)
	authed.POST("/api/engine/tactical-backtest", handleTacticalBacktest)
	authed.POST("/api/engine/tactical-grid-search", handleTacticalGridSearch)
	authed.POST("/api/engine/factor-regression", handleFactorRegression)
	authed.POST("/api/engine/calculators", handleCalculators)
	return r
}
