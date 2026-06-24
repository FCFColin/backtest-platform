package middleware

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// ipLimiters 存储每个 IP 对应的限流器。
//
// 企业理由：sync.Map 适合读多写少场景，IP 首次访问后限流器被复用，
// 避免每次请求加锁。生产环境单实例足够；多实例需替换为 Redis 等共享存储。
var ipLimiters sync.Map

// getLimiter 获取或创建指定 IP 的限流器。
func getLimiter(ip string, rps float64, burst int) *rate.Limiter {
	if v, ok := ipLimiters.Load(ip); ok {
		return v.(*rate.Limiter)
	}
	l := rate.NewLimiter(rate.Limit(rps), burst)
	actual, loaded := ipLimiters.LoadOrStore(ip, l)
	_ = loaded
	return actual.(*rate.Limiter)
}

// RateLimitMiddleware 基于 IP 的令牌桶限流中间件。
//
// 企业理由：engine-go 计算密集型 API 无限流时，
// 单个 IP 高频请求可耗尽 CPU/goroutine 资源，影响其他租户。
// 令牌桶允许突发流量（burst），同时限制长期平均速率（rps）。
//
// 参数：
//   - rps: 每秒允许的请求数（长期平均）
//   - burst: 突发请求上限（令牌桶容量）
//
// 超限时返回 429 Too Many Requests，并设置 Retry-After 头提示客户端重试间隔。
func RateLimitMiddleware(rps float64, burst int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := getLimiter(ip, rps, burst)

		if !limiter.Allow() {
			c.Header("Retry-After", "2")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "请求过于频繁，请稍后重试",
			})
			return
		}

		c.Next()
	}
}
