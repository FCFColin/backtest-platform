package handlers

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Pinger 抽象依赖健康探测（DB 连接池等），便于测试注入假实现。
// *pgxpool.Pool 天然满足此接口（Ping(ctx) error）。
type Pinger interface {
	Ping(ctx context.Context) error
}

// HandleReady 就绪检查端点（readinessProbe）。
//
// 企业理由（C-008）：readinessProbe 必须独立于 livenessProbe（/api/data/health）。
// data-fetcher 的核心依赖是 PostgreSQL——DB 故障时 Pod 应从 Service 摘除流量
// （返回 503 让 K8s 暂停路由），而非被重启（liveness 的职责）。
// 用 Pinger 接口解耦 DB 实现，使处理器可单测无需真实 DB。
func HandleReady(p Pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := p.Ping(c.Request.Context()); err != nil {
			slog.Warn("readiness 检查失败", "module", "handlers", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":  "unavailable",
				"engine":  "go",
				"service": "data-fetcher",
				"error":   err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "ready",
			"engine":  "go",
			"service": "data-fetcher",
		})
	}
}
