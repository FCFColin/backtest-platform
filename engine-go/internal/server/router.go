// Package server 提供 HTTP 路由和处理器。
package server

import (
	"engine-go/internal/middleware"
	gosharedmw "github.com/backtest/go-shared/middleware"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"net/http"
	"time"
)

const computeTimeout = 90 * time.Second

func SetupRouter(metricsHandler http.Handler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gosharedmw.SecurityHeadersMiddleware())
	r.Use(otelgin.Middleware("engine-go"))
	r.Use(middleware.RateLimitMiddleware(0.5, 30))
	r.GET("/api/engine/health", handleHealth)
	r.GET("/api/ready", handleReady)
	if metricsHandler != nil {
		r.GET("/metrics", gin.WrapH(metricsHandler))
	}
	authed := r.Group("/")
	authed.Use(gosharedmw.SharedTokenAuthMiddleware(
		"X-Engine-Auth",
		"ENGINE_AUTH_TOKEN",
		"missing X-Engine-Auth header",
		"no ENGINE_AUTH_TOKEN configured",
	))
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
