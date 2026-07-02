package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// ipLimiters 存储每个 IP 对应的限流器。
//
// 企业理由：sync.Map 适合读多写少场景，IP 首次访问后限流器被复用，
// 避免每次请求加锁。生产环境单实例足够；多实例需替换为 Redis 等共享存储。
var ipLimiters sync.Map

// limiterEntry 包装限流器及其最近访问时间，用于过期清理。
type limiterEntry struct {
	limiter    *rate.Limiter
	lastAccess time.Time
}

// getLimiter 获取或创建指定 IP 的限流器。
func getLimiter(ip string, rps float64, burst int) *rate.Limiter {
	if v, ok := ipLimiters.Load(ip); ok {
		entry := v.(*limiterEntry)
		entry.lastAccess = time.Now()
		return entry.limiter
	}
	l := rate.NewLimiter(rate.Limit(rps), burst)
	entry := &limiterEntry{limiter: l, lastAccess: time.Now()}
	actual, loaded := ipLimiters.LoadOrStore(ip, entry)
	if loaded {
		return actual.(*limiterEntry).limiter
	}
	return l
}

// startLimiterCleanup 启动定期清理过期限流器条目的协程。
// idleTTL 指定 IP 空闲多久后被清理；interval 指定清理周期。
//
// 企业理由：sync.Map 中的限流器条目会无限增长，大量唯一 IP 可导致
// 内存泄漏。定期清理长期空闲的条目，在内存与效率间取得平衡。
func startLimiterCleanup(idleTTL, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			ipLimiters.Range(func(key, value any) bool {
				entry := value.(*limiterEntry)
				if time.Since(entry.lastAccess) > idleTTL {
					ipLimiters.Delete(key)
				}
				return true
			})
		}
	}()
}

func init() {
	// 默认启动清理：空闲 10 分钟的 IP 被清理，每 5 分钟扫描一次
	startLimiterCleanup(10*time.Minute, 5*time.Minute)
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
