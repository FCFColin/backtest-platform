package main

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// DataServiceAuthMiddleware 校验 X-Data-Service-Auth 请求头与 DATA_SERVICE_AUTH_TOKEN 环境变量是否一致。
//
// 企业理由：data-fetcher 暴露行情数据和 baostock 实时查询 API，
// 无认证时任意调用方可消耗外部 API 配额（baostock 限流）和磁盘 I/O 资源。
// 使用常量时间比较防止时序侧信道泄露 token 信息。
//
// 配置：通过 DATA_SERVICE_AUTH_TOKEN 环境变量注入共享密钥，
// 生产环境必须设置为强随机值（>= 32 字符）。
func DataServiceAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		expected := strings.TrimSpace(os.Getenv("DATA_SERVICE_AUTH_TOKEN"))
		// 未配置 token 时拒绝所有请求，避免无认证暴露
		if expected == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "服务端未配置认证 token",
			})
			return
		}

		provided := c.GetHeader("X-Data-Service-Auth")
		if provided == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "缺少 X-Data-Service-Auth 认证头",
			})
			return
		}

		// 常量时间比较，防止时序攻击
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "认证失败",
			})
			return
		}

		c.Next()
	}
}

// buildCorsConfig 根据 CORS_ORIGINS 环境变量构造 CORS 配置，未配置时回退到本地前端默认源。
func buildCorsConfig() cors.Config {
	raw := os.Getenv("CORS_ORIGINS")
	var origins []string
	if strings.TrimSpace(raw) == "" {
		origins = []string{"http://localhost:5173"}
	} else {
		for _, s := range strings.Split(raw, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				origins = append(origins, s)
			}
		}
	}
	return cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}
}
