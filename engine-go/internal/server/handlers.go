package server

import (
	"context"
	"engine-go/internal/analysis"
	"engine-go/internal/calculators"
	"engine-go/internal/engine"
	"engine-go/internal/engine/tactical"
	"engine-go/internal/engineutil"
	"engine-go/internal/factorregression"
	"engine-go/internal/goaloptimizer"
	"engine-go/internal/letf"
	"engine-go/internal/middleware"
	"engine-go/internal/montecarlo"
	"engine-go/internal/optimizer"
	"engine-go/internal/pca"
	"engine-go/internal/signal"
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

type Problem = sharedhttp.Problem

func newProblem(c *gin.Context, status int, code, title, detail string) {
	sharedhttp.NewProblem(c, status, code, title, detail)
}
func withComputeSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return otel.Tracer("engine-go").Start(ctx, name, trace.WithAttributes(attrs...))
}
func okJSON(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}
func withComputeHandler[T any](c *gin.Context, errMsg string, fn func(ctx context.Context) (T, error)) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("计算处理器 panic", "path", c.Request.URL.Path, "panic", r)
			newProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
		}
	}()
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()
	result, err := fn(ctx)
	if err != nil {
		slog.Error("计算处理器失败", "path", c.Request.URL.Path, "error", err)
		newProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
		return
	}
	okJSON(c, result)
}
func withSpannedCompute[T any](c *gin.Context, errMsg, spanName string, fn func(ctx context.Context) (T, error)) {
	withComputeHandler(c, errMsg, func(ctx context.Context) (T, error) {
		ctx, span := withComputeSpan(ctx, spanName)
		defer span.End()
		return fn(ctx)
	})
}

func bindJSON[T any](c *gin.Context, code, msg string, req *T) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		newProblem(c, http.StatusBadRequest, code, "Bad Request", msg)
		return false
	}
	return true
}
func bindAndCompute[T any, R any](c *gin.Context, code, bindMsg, errMsg, spanName string, fn func(context.Context, T) (R, error)) {
	var req T
	if !bindJSON(c, code, bindMsg, &req) {
		return
	}
	run := func(ctx context.Context) (R, error) { return fn(ctx, req) }
	if spanName != "" {
		withSpannedCompute(c, errMsg, spanName, run)
	} else {
		withComputeHandler(c, errMsg, run)
	}
}

var maxGoroutinesForHealth = 10000

func init() {
	if v := os.Getenv("ENGINE_MAX_GOROUTINES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxGoroutinesForHealth = n
		}
	}
}

func handleHealth(c *gin.Context) {
	goroutines := runtime.NumGoroutine()
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	resp := gin.H{"engine": "go", "version": "0.1.0", "goroutines": goroutines}
	if goroutines > maxGoroutinesForHealth {
		resp["status"] = "unhealthy"
		resp["reason"] = "goroutine count exceeds threshold"
		resp["threshold"] = maxGoroutinesForHealth
		c.JSON(http.StatusServiceUnavailable, resp)
		return
	}
	resp["status"] = "ok"
	resp["heap_alloc"] = memStats.HeapAlloc
	resp["heap_sys"] = memStats.HeapSys
	c.JSON(http.StatusOK, resp)
}
func handleReady(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ready", "engine": "go"}) }

func handleBacktest(c *gin.Context) {
	var req engine.BacktestRequest
	if !bindJSON(c, "BACKTEST_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	if len(req.Portfolios) == 0 {
		newProblem(c, http.StatusBadRequest, "BACKTEST_EMPTY_PORTFOLIOS", "Bad Request", "portfolios 不能为空")
		return
	}
	if req.PriceData == nil {
		newProblem(c, http.StatusBadRequest, "BACKTEST_EMPTY_PRICE_DATA", "Bad Request", "priceData 不能为空")
		return
	}
	withSpannedCompute(c, "回测计算失败", "backtest.run", func(ctx context.Context) (*engine.BacktestResult, error) {
		return engine.RunBacktest(ctx, req)
	})
}
func handleStatistics(c *gin.Context) {
	var req engine.StatisticsRequest
	if !bindJSON(c, "STATISTICS_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	if len(req.Values) < 2 {
		newProblem(c, http.StatusBadRequest, "STATISTICS_INSUFFICIENT_DATA", "Bad Request", "values 至少需要 2 个数据点")
		return
	}
	withComputeHandler(c, "统计计算失败", func(ctx context.Context) (engine.Statistics, error) {
		return engine.CalculateStatisticsFromRequest(req), nil
	})
}
func handleAnalysis(c *gin.Context) {
	var req analysis.AnalysisRequest
	if !bindJSON(c, "ANALYSIS_BAD_REQUEST", "请求格式错误", &req) {
		return
	}
	if len(req.Tickers) == 0 {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_EMPTY_TICKERS", "Bad Request", "tickers 不能为空")
		return
	}
	if req.PriceData == nil {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_EMPTY_PRICE_DATA", "Bad Request", "priceData 不能为空")
		return
	}
	for _, ticker := range req.Tickers {
		if _, ok := req.PriceData[ticker]; !ok {
			newProblem(c, http.StatusBadRequest, "ANALYSIS_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
	}
	withComputeHandler(c, "分析计算失败", func(ctx context.Context) (analysis.AnalysisResult, error) {
		return analysis.RunAnalysis(ctx, req)
	})
}
func handlePCA(c *gin.Context) {
	var req pca.PCARequest
	if !bindJSON(c, "PCA_BAD_REQUEST", "请求解析失败", &req) {
		return
	}
	if len(req.Tickers) < 2 {
		newProblem(c, http.StatusBadRequest, "PCA_INSUFFICIENT_TICKERS", "Bad Request", "至少需要 2 个 ticker")
		return
	}
	withSpannedCompute(c, "PCA 计算失败", "pca.compute", func(ctx context.Context) (*pca.PCAResult, error) {
		return pca.PerformPCA(req)
	})
}
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
		newProblem(c, http.StatusBadRequest, "LETF_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
		return
	}
	withComputeHandler(c, "LETF 滑点分析失败", func(ctx context.Context) (*letf.LETFResult, error) {
		return letf.AnalyzeSlippage(letf.LETFRequest{LETFSeries: engineutil.ToPricePoints(letfData), BenchSeries: engineutil.ToPricePoints(benchData), Leverage: req.Leverage})
	})
}
func handleFactorRegression(c *gin.Context) {
	bindAndCompute(c, "FR_BAD_REQUEST", "请求解析失败", "因子回归计算失败", "", func(_ context.Context, req factorregression.FactorRegressionRequest) (*factorregression.RegressionResult, error) {
		return factorregression.RunRegression(req)
	})
}
func handleOptimize(c *gin.Context) {
	bindAndCompute(c, "OPTIMIZE_BAD_REQUEST", "请求解析失败", "优化计算失败", "optimizer.optimize", optimizer.Optimize)
}
func handleEfficientFrontier(c *gin.Context) {
	bindAndCompute(c, "FRONTIER_BAD_REQUEST", "请求解析失败", "有效前沿计算失败", "", optimizer.ComputeEfficientFrontier)
}
func handleMonteCarlo(c *gin.Context) {
	bindAndCompute(c, "MONTE_CARLO_BAD_REQUEST", "请求解析失败", "蒙特卡洛模拟失败", "montecarlo.simulate", montecarlo.RunMonteCarlo)
}
func handleGoalOptimize(c *gin.Context) {
	bindAndCompute(c, "GOAL_BAD_REQUEST", "请求解析失败", "目标优化计算失败", "", func(_ context.Context, req goaloptimizer.GoalOptimizerRequest) (*goaloptimizer.GoalOptimizerResult, error) {
		return goaloptimizer.OptimizeGoals(req)
	})
}
func handleTacticalBacktest(c *gin.Context) {
	bindAndCompute(c, "TACTICAL_BAD_REQUEST", "请求解析失败", "战术回测计算失败", "", tactical.RunTacticalBacktest)
}
func handleTacticalGridSearch(c *gin.Context) {
	bindAndCompute(c, "GRID_BAD_REQUEST", "请求解析失败", "网格搜索计算失败", "", tactical.RunGridSearch)
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
	require := func(code, msg string, ok bool) bool {
		if !ok {
			newProblem(c, http.StatusBadRequest, code, "Bad Request", msg)
		}
		return ok
	}
	switch req.Type {
	case "cagr":
		if require("CALC_MISSING_CAGR", "cagr 类型需要 cagr 参数", req.CAGR != nil) {
			okJSON(c, calculators.CalcCAGR(*req.CAGR))
		}
	case "swr":
		if require("CALC_MISSING_SWR", "swr 类型需要 swr 参数", req.SWR != nil) {
			okJSON(c, calculators.CalcSWR(*req.SWR))
		}
	case "frontier":
		if require("CALC_MISSING_FRONTIER", "frontier 类型需要 frontier 参数", req.Frontier != nil) {
			okJSON(c, calculators.CalcTwoFundFrontier(*req.Frontier))
		}
	default:
		newProblem(c, http.StatusBadRequest, "CALC_INVALID_TYPE", "Bad Request", "type 必须是 cagr/swr/frontier")
	}
}

func handleSignalAnalyze(c *gin.Context) {
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
	bad := func(code, msg string) {
		newProblem(c, http.StatusBadRequest, code, "Bad Request", msg)
	}
	missing := func() { bad("SIGNAL_TICKER_NOT_FOUND", "ticker 在 priceData 中不存在") }
	getTd := func(ticker string) (map[string]float64, bool) {
		td, ok := req.PriceData[ticker]
		if !ok {
			missing()
		}
		return td, ok
	}
	switch req.Mode {
	case "single":
		if req.Single == nil {
			bad("SIGNAL_MISSING_SINGLE", "single 模式需要 single 参数")
			return
		}
		td, ok := getTd(req.Single.Ticker)
		if !ok {
			return
		}
		okJSON(c, signal.AnalyzeSignal(*req.Single, engineutil.ToPricePoints(td)))
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
		td, ok := getTd(req.Multi.Signals[0].Ticker)
		if !ok {
			return
		}
		okJSON(c, signal.AnalyzeMultiSignal(ctx, req.Multi.Signals, engineutil.ToPricePoints(td), req.Multi.AggregationMethod, req.Multi.Weights))
	default:
		bad("SIGNAL_INVALID_MODE", "mode 必须是 single/dual/multi")
	}
}

const computeTimeout = 90 * time.Second

func SetupRouter(metricsHandler http.Handler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), gosharedmw.SecurityHeadersMiddleware(), otelgin.Middleware("engine-go"), middleware.RateLimitMiddleware(0.5, 30))
	r.GET("/api/engine/health", handleHealth)
	r.GET("/api/ready", handleReady)
	if metricsHandler != nil {
		r.GET("/metrics", gin.WrapH(metricsHandler))
	}
	authed := r.Group("/")
	authed.Use(gosharedmw.SharedTokenAuthMiddleware("X-Engine-Auth", "ENGINE_AUTH_TOKEN", "missing X-Engine-Auth header", "no ENGINE_AUTH_TOKEN configured"))
	{
		authed.POST("/api/engine/backtest", handleBacktest)
		authed.POST("/api/engine/analysis", handleAnalysis)
		authed.POST("/api/engine/optimize", handleOptimize)
		authed.POST("/api/engine/efficient-frontier", handleEfficientFrontier)
		authed.POST("/api/engine/monte-carlo", handleMonteCarlo)
		authed.POST("/api/engine/statistics", handleStatistics)
		authed.POST("/api/engine/signal-analyze", handleSignalAnalyze)
		authed.POST("/api/engine/pca", handlePCA)
		authed.POST("/api/engine/letf-analyze", handleLETFAnalyze)
		authed.POST("/api/engine/goal-optimize", handleGoalOptimize)
		authed.POST("/api/engine/tactical-backtest", handleTacticalBacktest)
		authed.POST("/api/engine/tactical-grid-search", handleTacticalGridSearch)
		authed.POST("/api/engine/factor-regression", handleFactorRegression)
		authed.POST("/api/engine/calculators", handleCalculators)
	}
	return r
}
