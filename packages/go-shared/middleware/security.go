// Package middleware 提供跨服务共享的 Gin 中间件。
package middleware

import (
	"github.com/gin-gonic/gin"
)

// SecurityHeadersMiddleware 注入通用安全响应头，缓解 XSS、点击劫持、MIME 嗅探等常见攻击面。
//
// 企业理由：engine-go 与 data-fetcher 原各自维护相同的 4 行安全头配置，DRY 收口。
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "0")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}
