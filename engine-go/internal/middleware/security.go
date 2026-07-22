package middleware

import (
	"github.com/gin-gonic/gin"

	gosharedmw "github.com/backtest/go-shared/middleware"
)

// SecurityHeadersMiddleware re-export 自 go-shared/middleware，注入通用安全响应头。
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return gosharedmw.SecurityHeadersMiddleware()
}
