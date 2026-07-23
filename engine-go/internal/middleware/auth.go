// Package middleware 提供 HTTP 中间件（认证、限流等）。
//
// 企业理由：将横切关注点（认证、限流）与业务逻辑分离，
// 遵循单一职责原则，便于独立测试和复用。
package middleware

import (
	"github.com/gin-gonic/gin"

	gosharedmw "github.com/backtest/go-shared/middleware"
)

// EngineAuthMiddleware 校验 X-Engine-Auth 请求头与 ENGINE_AUTH_TOKEN 环境变量是否一致。
//
// 企业理由：engine-go 暴露计算密集型 API（蒙特卡洛、组合优化），
// 无认证时任意调用方均可消耗 CPU 资源引发 DoS。
// 实际校验逻辑收口到 go-shared/middleware.SharedTokenAuthMiddleware，本服务仅声明 header/env 名称。
func EngineAuthMiddleware() gin.HandlerFunc {
	return gosharedmw.SharedTokenAuthMiddleware(
		"X-Engine-Auth",
		"ENGINE_AUTH_TOKEN",
		"missing X-Engine-Auth header",
		"no ENGINE_AUTH_TOKEN configured",
	)
}

// SecurityHeadersMiddleware re-export 自 go-shared/middleware，注入通用安全响应头。
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return gosharedmw.SecurityHeadersMiddleware()
}
