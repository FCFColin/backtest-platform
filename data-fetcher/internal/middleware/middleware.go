// Package middleware 提供 data-fetcher 服务的 HTTP 中间件与 CORS 配置。
package middleware

import (
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	gosharedmw "github.com/backtest/go-shared/middleware"
)

// DataServiceAuthMiddleware 校验 X-Data-Service-Auth 请求头与 DATA_SERVICE_AUTH_TOKEN 环境变量是否一致。
//
// 企业理由：data-fetcher 暴露行情数据和 baostock 实时查询 API，
// 无认证时任意调用方可消耗外部 API 配额（baostock 限流）和磁盘 I/O 资源。
// 实际校验逻辑收口到 go-shared/middleware.SharedTokenAuthMiddleware，本服务仅声明 header/env 名称。
func DataServiceAuthMiddleware() gin.HandlerFunc {
	return gosharedmw.SharedTokenAuthMiddleware(
		"X-Data-Service-Auth",
		"DATA_SERVICE_AUTH_TOKEN",
		"missing X-Data-Service-Auth header",
		"no DATA_SERVICE_AUTH_TOKEN configured",
	)
}

// BuildCorsConfig 根据 CORS_ORIGINS 环境变量构造 CORS 配置，未配置时回退到本地前端默认源。
func BuildCorsConfig() cors.Config {
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
