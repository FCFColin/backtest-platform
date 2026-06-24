// Package server 提供 HTTP 路由和处理器。
// 企业理由：将路由定义与业务逻辑分离，遵循 Go 标准项目布局。
// router.go 负责路由注册，analysis.go 负责业务计算。
package server

import (
	"net/http"

	"engine-go/internal/analysis"
	"engine-go/internal/middleware"
	"engine-go/internal/montecarlo"
	"engine-go/internal/optimizer"

	"github.com/gin-gonic/gin"
)

// SetupRouter 初始化并返回 Gin 路由引擎。
// 企业理由：集中管理所有 API 路由，便于维护和测试。
func SetupRouter() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	// 限流中间件：0.5 rps = 30 req/min，burst 30
	// 企业理由：计算密集型 API 无限流时单个 IP 高频请求可耗尽 CPU 资源。
	// 应用到所有路由（含健康检查），避免健康检查被滥用。
	r.Use(middleware.RateLimitMiddleware(0.5, 30))

	// 健康检查端点：无需认证，便于负载均衡器/K8s 探针访问
	r.GET("/api/engine/health", handleHealth)

	// 认证路由组：所有业务 API 强制校验 X-Engine-Auth 头
	authed := r.Group("/")
	authed.Use(middleware.EngineAuthMiddleware())
	{
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

// handleAnalysis 单资产分析处理器。
// 企业理由：接收前端传入的 priceData 和参数，调用 analysis.RunAnalysis 计算结果。
// priceData 由前端传入而非 Go 服务读取文件，保持无状态设计，便于水平扩展。
func handleAnalysis(c *gin.Context) {
	var req analysis.AnalysisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误: " + err.Error()})
		return
	}

	if len(req.Tickers) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tickers 不能为空"})
		return
	}

	if req.PriceData == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "priceData 不能为空"})
		return
	}

	// 验证每个 ticker 在 priceData 中存在
	for _, ticker := range req.Tickers {
		if _, ok := req.PriceData[ticker]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "ticker " + ticker + " 在 priceData 中不存在",
			})
			return
		}
	}

	result := analysis.RunAnalysis(req)
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
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求解析失败: " + err.Error(),
		})
		return
	}

	result, err := optimizer.Optimize(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "优化计算失败: " + err.Error(),
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
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求解析失败: " + err.Error(),
		})
		return
	}

	result, err := optimizer.ComputeEfficientFrontier(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "有效前沿计算失败: " + err.Error(),
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
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求解析失败: " + err.Error(),
		})
		return
	}

	result, err := montecarlo.RunMonteCarlo(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "蒙特卡洛模拟失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
