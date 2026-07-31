// Package server 提供 HTTP 路由和处理器。
package server
import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "runtime"
    "strconv"
    "engine-go/internal/analysis"
    "engine-go/internal/calculators"
    "engine-go/internal/engine"
    "engine-go/internal/engine/tactical"
    "engine-go/internal/factorregression"
    "engine-go/internal/goaloptimizer"
    "engine-go/internal/letf"
    "engine-go/internal/montecarlo"
    "engine-go/internal/optimizer"
    "engine-go/internal/pca"
    "engine-go/internal/signal"
    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
    sharedhttp "github.com/backtest/go-shared/http"
)
type Problem = sharedhttp.Problem
func newProblem(c *gin.Context, status int, code, title, detail string) {
	sharedhttp.NewProblem(c, status, code, title, detail)
}
func withComputeSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return otel.Tracer("engine-go").Start(ctx, name, trace.WithAttributes(attrs...))
}
func withComputeHandler[T any]( c *gin.Context, errMsg string, fn func(ctx context.Context) (T, error), ) {
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
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
var maxGoroutinesForHealth = 10000
func init() {
	if v := os.Getenv("ENGINE_MAX_GOROUTINES"); v != "" {
if n, err := strconv.Atoi(v); err == nil && n > 0 { maxGoroutinesForHealth = n }
	}
}
func handleHealth(c *gin.Context) {
	goroutines := runtime.NumGoroutine()
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	if goroutines > maxGoroutinesForHealth {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":     "unhealthy",
			"engine":     "go",
			"version":    "0.1.0",
			"reason":     "goroutine count exceeds threshold",
			"goroutines": goroutines,
			"threshold":  maxGoroutinesForHealth,
		})
		return
	}
c.JSON(http.StatusOK, gin.H{ "status": "ok", "engine": "go", "version": "0.1.0", "goroutines": goroutines, "heap_alloc": memStats.HeapAlloc, "heap_sys": memStats.HeapSys })
}
func handleReady(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{ "status": "ready", "engine": "go", })
}
func handleBacktest(c *gin.Context) {
	var req engine.BacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "BACKTEST_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
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
withComputeHandler(c, "回测计算失败", func(ctx context.Context) (*engine.BacktestResult, error) { ctx, span := withComputeSpan(ctx, "backtest.run"); defer span.End(); return engine.RunBacktest(ctx, req) })
}
func handleStatistics(c *gin.Context) {
	var req engine.StatisticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "STATISTICS_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}
	if len(req.Values) < 2 {
		newProblem(c, http.StatusBadRequest, "STATISTICS_INSUFFICIENT_DATA", "Bad Request", "values 至少需要 2 个数据点")
		return
	}
withComputeHandler(c, "统计计算失败", func(ctx context.Context) (engine.Statistics, error) { return engine.CalculateStatisticsFromRequest(req), nil })
}
func handleAnalysis(c *gin.Context) {
	var req analysis.AnalysisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_BAD_REQUEST", "Bad Request", "请求格式错误")
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
withComputeHandler(c, "分析计算失败", func(ctx context.Context) (analysis.AnalysisResult, error) { return analysis.RunAnalysis(ctx, req) })
}
func handlePCA(c *gin.Context) {
	var req pca.PCARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "PCA_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	if len(req.Tickers) < 2 {
		newProblem(c, http.StatusBadRequest, "PCA_INSUFFICIENT_TICKERS", "Bad Request", "至少需要 2 个 ticker")
		return
	}
withComputeHandler(c, "PCA 计算失败", func(ctx context.Context) (*pca.PCAResult, error) { ctx, span := withComputeSpan(ctx, "pca.compute"); defer span.End(); return pca.PerformPCA(req) })
}
func handleLETFAnalyze(c *gin.Context) {
	var req struct {
		LETFTicker      string                        `json:"letfTicker"`
		BenchmarkTicker string                        `json:"benchmarkTicker"`
		Leverage        float64                       `json:"leverage"`
		PriceData       map[string]map[string]float64 `json:"priceData"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "LETF_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	letfData, ok1 := req.PriceData[req.LETFTicker]
	benchData, ok2 := req.PriceData[req.BenchmarkTicker]
	if !ok1 || !ok2 {
		newProblem(c, http.StatusBadRequest, "LETF_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
		return
	}
	letfSeries := letf.ToPricePoints(letfData)
	benchSeries := letf.ToPricePoints(benchData)
	withComputeHandler(c, "LETF 滑点分析失败", func(ctx context.Context) (*letf.LETFResult, error) {
return letf.AnalyzeSlippage(letf.LETFRequest{ LETFSeries: letfSeries, BenchSeries: benchSeries, Leverage: req.Leverage })
	})
}
func handleFactorRegression(c *gin.Context) {
	var req factorregression.FactorRegressionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "FR_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
withComputeHandler(c, "因子回归计算失败", func(ctx context.Context) (*factorregression.RegressionResult, error) { return factorregression.RunRegression(req) })
}
func handleOptimize(c *gin.Context) {
	var req optimizer.OptimizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "OPTIMIZE_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}
	withComputeHandler(c, "优化计算失败", func(ctx context.Context) (*optimizer.OptimizeResponse, error) {
		ctx, span := withComputeSpan(ctx, "optimizer.optimize")
		defer span.End()
		return optimizer.Optimize(ctx, req)
	})
}
func handleEfficientFrontier(c *gin.Context) {
	var req optimizer.FrontierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "FRONTIER_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}
withComputeHandler(c, "有效前沿计算失败", func(ctx context.Context) (*optimizer.FrontierResponse, error) { return optimizer.ComputeEfficientFrontier(ctx, req) })
}
func handleMonteCarlo(c *gin.Context) {
	var req montecarlo.MonteCarloRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "MONTE_CARLO_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}
	withComputeHandler(c, "蒙特卡洛模拟失败", func(ctx context.Context) (*montecarlo.MonteCarloResult, error) {
		ctx, span := withComputeSpan(ctx, "montecarlo.simulate")
		defer span.End()
		return montecarlo.RunMonteCarlo(ctx, req)
	})
}
func handleGoalOptimize(c *gin.Context) {
	var req goaloptimizer.GoalOptimizerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "GOAL_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
withComputeHandler(c, "目标优化计算失败", func(ctx context.Context) (*goaloptimizer.GoalOptimizerResult, error) { return goaloptimizer.OptimizeGoals(req) })
}
func handleTacticalBacktest(c *gin.Context) {
	var req tactical.TacticalBacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "TACTICAL_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
withComputeHandler(c, "战术回测计算失败", func(ctx context.Context) (*tactical.TacticalBacktestResult, error) { return tactical.RunTacticalBacktest(ctx, req) })
}
func handleTacticalGridSearch(c *gin.Context) {
	var req tactical.TacticalGridRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "GRID_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
withComputeHandler(c, "网格搜索计算失败", func(ctx context.Context) (*tactical.TacticalGridResponse, error) { return tactical.RunGridSearch(ctx, req) })
}
func handleCalculators(c *gin.Context) {
	var req struct {
		Type     string                              `json:"type"`
		CAGR     *calculators.CAGRRequest            `json:"cagr,omitempty"`
		SWR      *calculators.SWRRequest             `json:"swr,omitempty"`
		Frontier *calculators.TwoFundFrontierRequest `json:"frontier,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "CALC_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	switch req.Type {
case "cagr": if req.CAGR == nil { newProblem(c, http.StatusBadRequest, "CALC_MISSING_CAGR", "Bad Request", "cagr 类型需要 cagr 参数"); return }
		result := calculators.CalcCAGR(*req.CAGR)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
case "swr": if req.SWR == nil { newProblem(c, http.StatusBadRequest, "CALC_MISSING_SWR", "Bad Request", "swr 类型需要 swr 参数"); return }
		result := calculators.CalcSWR(*req.SWR)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
case "frontier": if req.Frontier == nil { newProblem(c, http.StatusBadRequest, "CALC_MISSING_FRONTIER", "Bad Request", "frontier 类型需要 frontier 参数"); return }
		result := calculators.CalcTwoFundFrontier(*req.Frontier)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	default: newProblem(c, http.StatusBadRequest, "CALC_INVALID_TYPE", "Bad Request", "type 必须是 cagr/swr/frontier")
	}
}
func handleSignalAnalyze(c *gin.Context) {
	var req struct {
		Mode      string                        `json:"mode"` // "single" | "dual" | "multi"
		Single    *signal.SignalAnalysisRequest `json:"single,omitempty"`
		Dual      *signal.DualSignalConfig      `json:"dual,omitempty"`
		Multi     *signal.MultiSignalConfig     `json:"multi,omitempty"`
		PriceData map[string]map[string]float64 `json:"priceData"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "SIGNAL_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()
	switch req.Mode {
case "single": if req.Single == nil { newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_SINGLE", "Bad Request", "single 模式需要 single 参数"); return }
		tickerData, ok := req.PriceData[req.Single.Ticker]
		if !ok {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data := signal.ToPricePoints(tickerData)
		result := signal.AnalyzeSignal(*req.Single, data)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
case "dual": if req.Dual == nil { newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_DUAL", "Bad Request", "dual 模式需要 dual 参数"); return }
		td1, ok1 := req.PriceData[req.Dual.Signal1.Ticker]
		td2, ok2 := req.PriceData[req.Dual.Signal2.Ticker]
		if !ok1 || !ok2 {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data1 := signal.ToPricePoints(td1)
		data2 := signal.ToPricePoints(td2)
		result := signal.AnalyzeDualSignal(req.Dual.Signal1, req.Dual.Signal2, data1, data2, req.Dual.CombinationMethod)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
case "multi": if req.Multi == nil || len(req.Multi.Signals) == 0 { newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_MULTI", "Bad Request", "multi 模式需要 multi.signals 参数"); return }
		ticker := req.Multi.Signals[0].Ticker
		td, ok := req.PriceData[ticker]
		if !ok {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data := signal.ToPricePoints(td)
		result := signal.AnalyzeMultiSignal(ctx, req.Multi.Signals, data, req.Multi.AggregationMethod, req.Multi.Weights)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	default: newProblem(c, http.StatusBadRequest, "SIGNAL_INVALID_MODE", "Bad Request", "mode 必须是 single/dual/multi")
	}
}
