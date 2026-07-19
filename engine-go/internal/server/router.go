// Package server 提供 HTTP 路由和处理器。
// router.go 负责路由注册与中间件配置，各领域处理器按文件分离：
//   - handler_backtest.go:   组合回测与统计指标
//   - handler_optimize.go:   组合优化、有效前沿、蒙特卡洛、目标优化
//   - handler_analysis.go:   单资产分析、PCA、LETF、因子回归
//   - handler_tactical.go:   战术分配、网格搜索、信号分析
//   - handler_calculators.go: 金融计算器
package server

import (
	"net/http"
	"time"

	"engine-go/internal/middleware"

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
		// 组合回测 API（ADR-008）：Go 主引擎暴露完整回测端点
		authed.POST("/api/engine/backtest", handleBacktest)

		// 单资产分析 API（T-ARCH-2.5）
		authed.POST("/api/engine/analysis", handleAnalysis)

		// 组合优化 API（T-ARCH-2.4）
		authed.POST("/api/engine/optimize", handleOptimize)
		authed.POST("/api/engine/efficient-frontier", handleEfficientFrontier)

		// 蒙特卡洛模拟 API（T-ARCH-2.3）
		authed.POST("/api/engine/monte-carlo", handleMonteCarlo)

		// 统计指标计算 API
		authed.POST("/api/engine/statistics", handleStatistics)

		// 信号分析 API — 支持单/双/多信号分析
		authed.POST("/api/engine/signal-analyze", handleSignalAnalyze)

		// PCA 主成分分析 API
		authed.POST("/api/engine/pca", handlePCA)

		// LETF 滑点分析 API
		authed.POST("/api/engine/letf-analyze", handleLETFAnalyze)

		// 目标优化（蒙特卡洛模拟）API
		authed.POST("/api/engine/goal-optimize", handleGoalOptimize)

		// 战术分配回测 API
		authed.POST("/api/engine/tactical-backtest", handleTacticalBacktest)

		// 战术网格搜索 API
		authed.POST("/api/engine/tactical-grid-search", handleTacticalGridSearch)

		// Fama-French 因子回归 API
		authed.POST("/api/engine/factor-regression", handleFactorRegression)

		// 金融计算器 API
		authed.POST("/api/engine/calculators", handleCalculators)
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
