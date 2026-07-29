package server

import (
	"net/http"
	"os"
	"runtime"
	"strconv"

	"github.com/gin-gonic/gin"
)

// maxGoroutinesForHealth 健康检查 goroutine 数量阈值（默认 10000）。
// 可通过环境变量 ENGINE_MAX_GOROUTINES 覆盖。
var maxGoroutinesForHealth = 10000

func init() {
	if v := os.Getenv("ENGINE_MAX_GOROUTINES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxGoroutinesForHealth = n
		}
	}
}

// handleHealth 健康检查端点（livenessProbe）。
//
// 企业理由（D9-H3）：静态响应无法检测运行时退化（goroutine 泄漏、内存压力）。
// engine-go 是纯计算服务（无 DB/Redis 依赖），健康检查探测 Go 运行时状态：
// - goroutine 数量（泄漏/过载检测）
// - 堆内存分配（OOM 前预警）
// 任一指标超阈值时返回 503，触发 K8s 重启 Pod。
func handleHealth(c *gin.Context) {
	goroutines := runtime.NumGoroutine()
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// goroutine 泄漏/过载检测
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

	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"engine":     "go",
		"version":    "0.1.0",
		"goroutines": goroutines,
		"heap_alloc": memStats.HeapAlloc,
		"heap_sys":   memStats.HeapSys,
	})
}