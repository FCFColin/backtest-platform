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
func withComputeHandler[T any](c *gin.Context, errMsg string, fn func(ctx context.Context) (T, error)) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("计算处理器 panic", "path", c.Request.URL.Path, "panic", r)
			sharedhttp.NewProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
		}
	}()
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()
	result, err := fn(ctx)
	if err != nil {
		var inputErr *engineutil.InputError
		if errors.As(err, &inputErr) {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "COMPUTE_INPUT_ERROR", "Bad Request", inputErr.Error())
			return
		}
		if errors.Is(err, context.DeadlineExceeded) {
			c.Header("Retry-After", "5")
			sharedhttp.NewProblem(c, http.StatusServiceUnavailable, "COMPUTE_TIMEOUT", "Computation Timeout", errMsg)
			return
		}
		slog.Error("计算处理器失败", "path", c.Request.URL.Path, "error", err)
		sharedhttp.NewProblem(c, http.StatusInternalServerError, "COMPUTE_FAILED", "Computation Failed", errMsg)
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
	bindCompute(c, "BACKTEST_BAD_REQUEST", "请求解析失败", "回测计算失败", "backtest.run",
		func(req engine.BacktestRequest) (string, string) {
			if len(req.Portfolios) == 0 {
				return "BACKTEST_EMPTY_PORTFOLIOS", "portfolios 不能为空"
			}
			if req.PriceData == nil {
				return "BACKTEST_EMPTY_PRICE_DATA", "priceData 不能为空"
			}
			return "", ""
		}, engine.RunBacktest)
}
func handleStatistics(c *gin.Context) {
	bindCompute(c, "STATISTICS_BAD_REQUEST", "请求解析失败", "统计计算失败", "",
		func(req engine.StatisticsRequest) (string, string) {
			if len(req.Values) < 2 {
				return "STATISTICS_INSUFFICIENT_DATA", "values 至少需要 2 个数据点"
			}
			return "", ""
		},
		func(_ context.Context, req engine.StatisticsRequest) (engine.Statistics, error) {
			return engine.CalculateStatisticsFromRequest(req), nil
		})
}
func handleAnalysis(c *gin.Context) {
	bindCompute(c, "ANALYSIS_BAD_REQUEST", "请求格式错误", "分析计算失败", "",
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
}
func handlePCA(c *gin.Context) {
	bindCompute(c, "PCA_BAD_REQUEST", "请求解析失败", "PCA 计算失败", "pca.compute",
		func(req analysis.PCARequest) (string, string) {
			if len(req.Tickers) < 2 {
				return "PCA_INSUFFICIENT_TICKERS", "至少需要 2 个 ticker"
			}
			return "", ""
		},
		func(_ context.Context, req analysis.PCARequest) (*analysis.PCAResult, error) {
			return analysis.PerformPCA(req)
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
		sharedhttp.NewProblem(c, http.StatusBadRequest, "LETF_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
		return
	}
	withComputeHandler(c, "LETF 滑点分析失败", func(ctx context.Context) (*analysis.LETFResult, error) {
		return analysis.AnalyzeSlippage(analysis.LETFRequest{LETFSeries: engineutil.ToPricePoints(letfData), BenchSeries: engineutil.ToPricePoints(benchData), Leverage: req.Leverage})
	})
}
func handleFactorRegression(c *gin.Context) {
	bindCompute(c, "FR_BAD_REQUEST", "请求解析失败", "因子回归计算失败", "", nil, func(_ context.Context, req analysis.FactorRegressionRequest) (*analysis.RegressionResult, error) {
		return analysis.RunRegression(req)
	})
}
func handleOptimize(c *gin.Context) {
	bindCompute(c, "OPTIMIZE_BAD_REQUEST", "请求解析失败", "优化计算失败", "optimizer.optimize", nil, optimizer.Optimize)
}
func handleEfficientFrontier(c *gin.Context) {
	bindCompute(c, "FRONTIER_BAD_REQUEST", "请求解析失败", "有效前沿计算失败", "", nil, optimizer.ComputeEfficientFrontier)
}
func handleMonteCarlo(c *gin.Context) {
	bindCompute(c, "MONTE_CARLO_BAD_REQUEST", "请求解析失败", "蒙特卡洛模拟失败", "montecarlo.simulate", nil, montecarlo.RunMonteCarlo)
}
func handleGoalOptimize(c *gin.Context) {
	bindCompute(c, "GOAL_BAD_REQUEST", "请求解析失败", "目标优化计算失败", "", nil, func(ctx context.Context, req goaloptimizer.GoalOptimizerRequest) (*goaloptimizer.GoalOptimizerResult, error) {
		return goaloptimizer.OptimizeGoals(ctx, req)
	})
}
func handleTacticalBacktest(c *gin.Context) {
	bindCompute(c, "TACTICAL_BAD_REQUEST", "请求解析失败", "战术回测计算失败", "", nil, tactical.RunTacticalBacktest)
}
func handleTacticalGridSearch(c *gin.Context) {
	bindCompute(c, "GRID_BAD_REQUEST", "请求解析失败", "网格搜索计算失败", "", nil, tactical.RunGridSearch)
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
	withComputeHandler(c, "计算器计算失败", func(_ context.Context) (any, error) {
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
	authed.Use(gosharedmw.SharedTokenAuthMiddleware("X-Engine-Auth", "ENGINE_AUTH_TOKEN", "missing X-Engine-Auth header", "no ENGINE_AUTH_TOKEN configured"), middleware.RateLimitMiddleware(0.5, 30))
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
