package middleware
import (
    "net/http"
    "sync"
    "time"
    "github.com/gin-gonic/gin"
    "golang.org/x/time/rate"
)
var ipLimiters sync.Map
type limiterEntry struct {
	limiter    *rate.Limiter
	lastAccess time.Time
}
func getLimiter(ip string, rps float64, burst int) *rate.Limiter {
	if v, ok := ipLimiters.Load(ip); ok {
		entry := v.(*limiterEntry)
		entry.lastAccess = time.Now()
		return entry.limiter
	}
	l := rate.NewLimiter(rate.Limit(rps), burst)
	entry := &limiterEntry{limiter: l, lastAccess: time.Now()}
	actual, loaded := ipLimiters.LoadOrStore(ip, entry)
	if loaded { return actual.(*limiterEntry).limiter }
	return l
}
func startLimiterCleanup(idleTTL, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
ipLimiters.Range(func(key, value any) bool { entry := value.(*limiterEntry); if time.Since(entry.lastAccess) > idleTTL { ipLimiters.Delete(key) }; return true })
		}
	}()
}
func init() {
	startLimiterCleanup(10*time.Minute, 5*time.Minute)
}
func RateLimitMiddleware(rps float64, burst int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := getLimiter(ip, rps, burst)
		if !limiter.Allow() {
			c.Header("Retry-After", "2")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{ "error": "请求过于频繁，请稍后重试", })
			return
		}
		c.Next()
	}
}
