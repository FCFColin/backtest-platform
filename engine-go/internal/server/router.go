// Package server 提供 HTTP 路由和处理器。
// 企业理由：将路由定义与业务逻辑分离，遵循 Go 标准项目布局。
// router.go 负责路由注册，analysis.go 负责业务计算。
package server

import (
	"context"
	"net/http"
	"time"

	"engine-go/internal/analysis"
	"engine-go/internal/engine"
	"engine-go/internal/middleware"
	"engine-go/internal/montecarlo"
	"engine-go/internal/optimizer"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

// computeTimeout 每个 compute handler 的 per-request 计算超时。
// 企业理由（R-11）：http.Server.WriteTimeout=120s 仅作兜底；此处 90s 留 30s 余量给
// 响应序列化与网络写出，避免计算占用全部时间导致连接被服务端硬断而客户端收不到 JSON 错误体。
const computeTimeout = 90 * time.Second

// SetupRouter 初始化并返回 Gin 路由引擎。
// metricsHandler 为 Prometheus /metrics 处理器（T-B4）。
func SetupRouter(metricsHandler http.Handler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.SecurityHeadersMiddleware())

	// 企业理由（ADR-015）：otelgin 为每个 HTTP 请求创建 span，与 Node API trace 通过 traceparent 串联。
	r.Use(otelgin.Middleware("engine-go"))

	// 限流中间件：0.5 rps = 30 req/min，burst 30
	// 企业理由：计算密集型 API 无限流时单个 IP 高频请求可耗尽 CPU 资源。
	// 应用到所有路由（含健康检查），避免健康检查被滥用。
	r.Use(middleware.RateLimitMiddleware(0.5, 30))

	// 健康检查端点：无需认证，便于负载均衡器/K8s 探针访问
	r.GET("/api/engine/health", handleHealth)

	// Prometheus 指标（T-B4）：与 Node API /api/metrics 对齐，供 Prometheus 抓取。
	if metricsHandler != nil {
		r.GET("/metrics", gin.WrapH(metricsHandler))
	}

	// 认证路由组：所有业务 API 强制校验 X-Engine-Auth 头
	authed := r.Group("/")
	authed.Use(middleware.EngineAuthMiddleware())
	{
		// 组合回测 API（ADR-008）：Go 主引擎暴露完整回测端点，
		// 替代原 Rust-only 路径，支持现金流/glidepath/汇率/CPI/再平衡偏离带。
		authed.POST("/api/engine/backtest", handleBacktest)

		// 单资产分析 API（T-ARCH-2.5）
		authed.POST("/api/engine/analysis", handleAnalysis)

		// 组合优化 API（T-ARCH-2.4）
		authed.POST("/api/engine/optimize", handleOptimize)
		authed.POST("/api/engine/efficient-frontier", handleEfficientFrontier)

		// 蒙特卡洛模拟 API（T-ARCH-2.3）
		authed.POST("/api/engine/monte-carlo", handleMonteCarlo)
	}

	return r
}

// handleHealth 健康检查端点。
func handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"engine":  "go",
		"version": "0.1.0",
	})
}

// handleBacktest 组合回测处理器（ADR-008）。
//
// 企业理由：Go 引擎作为主回测引擎暴露 HTTP 接口，接收前端/API 传入的
// priceData、portfolios 与 params，调用 engine.RunBacktest 计算净值曲线、
// 统计指标、回撤与相关性。无状态设计（priceData 由调用方传入）便于水平扩展，
// 接口与 Rust 引擎 /api/engine/backtest 兼容，确保降级链路一致。
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := engine.RunBacktest(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "回测计算失败",
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// handleAnalysis 单资产分析处理器。
// 企业理由：接收前端传入的 priceData 和参数，调用 analysis.RunAnalysis 计算结果。
// priceData 由前端传入而非 Go 服务读取文件，保持无状态设计，便于水平扩展。
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := analysis.RunAnalysis(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "分析计算失败",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// handleOptimize 组合优化处理器（T-ARCH-2.4）
//
// 企业理由：根据用户选择的目标（最大夏普比/最小波动率/最大收益），
// 计算最优资产权重配置。闭式解优先，失败时回退到随机搜索。
func handleOptimize(c *gin.Context) {
	var req optimizer.OptimizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "OPTIMIZE_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := optimizer.Optimize(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "优化计算失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// handleEfficientFrontier 有效前沿处理器（T-ARCH-2.4）
//
// 企业理由：计算有效前沿曲线，前端绘制风险-收益散点图，
// 帮助用户直观理解不同配置下的收益与波动关系。
func handleEfficientFrontier(c *gin.Context) {
	var req optimizer.FrontierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "FRONTIER_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := optimizer.ComputeEfficientFrontier(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "有效前沿计算失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// handleMonteCarlo 蒙特卡洛模拟处理器（T-ARCH-2.3）
//
// 企业理由：蒙特卡洛模拟通过从历史收益率中重采样生成大量未来路径，
// 为投资者提供概率化的投资结果预测。与 Rust 引擎接口兼容，
// 支持 A/B 测试验证 Go 引擎与 Rust 引擎计算结果一致性。
func handleMonteCarlo(c *gin.Context) {
	var req montecarlo.MonteCarloRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "MONTE_CARLO_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := montecarlo.RunMonteCarlo(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "蒙特卡洛模拟失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
