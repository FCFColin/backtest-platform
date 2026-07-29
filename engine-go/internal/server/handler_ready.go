package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// handleReady 就绪检查端点（readinessProbe）。
//
// 企业理由（C-008）：readinessProbe 必须与 livenessProbe 使用独立路径。
// engine-go 是纯计算服务（无 DB/Redis 依赖，价格数据在请求体内传入），
// 故就绪检查仅需验证 HTTP 路由可响应——能返回 200 即证明进程可接收流量。
// 与 /api/engine/health 区分路径，便于未来扩展深度检查（如过载检测）
// 而无需变更 K8s 清单，同时避免依赖故障时触发 Pod 重启（liveness 的职责）。
func handleReady(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ready",
		"engine": "go",
	})
}
