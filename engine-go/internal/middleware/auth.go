// Package middleware 提供 HTTP 中间件（认证、限流等）。
//
// 企业理由：将横切关注点（认证、限流）与业务逻辑分离，
// 遵循单一职责原则，便于独立测试和复用。
package middleware

import (
	"crypto/subtle"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// EngineAuthMiddleware 校验 X-Engine-Auth 请求头与 ENGINE_AUTH_TOKEN 环境变量是否一致。
//
// 企业理由：engine-go 暴露计算密集型 API（蒙特卡洛、组合优化），
// 无认证时任意调用方均可消耗 CPU 资源引发 DoS。
// 使用常量时间比较防止时序侧信道泄露 token 信息。
//
// 配置：通过 ENGINE_AUTH_TOKEN 环境变量注入共享密钥，
// 生产环境必须设置为强随机值（>= 32 字符）。
func EngineAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		expected := os.Getenv("ENGINE_AUTH_TOKEN")
		// 未配置 token 时拒绝所有请求，避免无认证暴露
		if expected == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "服务端未配置认证 token",
			})
			return
		}

		provided := c.GetHeader("X-Engine-Auth")
		if provided == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "缺少 X-Engine-Auth 认证头",
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
