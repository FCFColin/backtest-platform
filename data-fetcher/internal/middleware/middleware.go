// Package middleware 提供 data-fetcher 服务的 HTTP 中间件与 CORS 配置。
package middleware
import (
    "os"
    "strings"
    "time"
    "github.com/gin-contrib/cors"
)
func BuildCorsConfig() cors.Config {
	raw := os.Getenv("CORS_ORIGINS")
	var origins []string
	if strings.TrimSpace(raw) == "" {
		origins = []string{"http://localhost:5173"}
	} else {
		for _, s := range strings.Split(raw, ",") {
			s = strings.TrimSpace(s)
if s != "" { origins = append(origins, s) }
		}
	}
	return cors.Config{
		AllowOrigins: origins, AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:  []string{"Origin", "Content-Type", "Accept"},
		ExposeHeaders: []string{"Content-Length"}, AllowCredentials: false, MaxAge: 12 * time.Hour,
	}
}
