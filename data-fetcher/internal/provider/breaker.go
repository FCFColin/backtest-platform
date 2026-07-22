// Package provider 提供数据源接口、注册表与跨 provider 共享的基础设施。
package provider

import (
	"log/slog"
	"time"

	"github.com/sony/gobreaker"
)

// NewProviderBreaker 创建数据源熔断器，统一 4 个 HTTP provider 的配置。
//
// 参数：
//   - name: 数据源名称（用于日志与熔断器标识）
//   - maxRequests: 半开状态下允许的最大请求数（yfinance/akshare/twelvedata/finnhub=3，baostock=5）
//
// 默认配置（从现有 5 处抽取，行为完全一致）：
//   - Interval: 60s（计数窗口）
//   - Timeout: 30s（打开后等待恢复的时间）
//   - ReadyToTrip: 连续失败 ≥5 或 5 请求内失败率 >50%
//   - OnStateChange: 记录 slog.Warn
func NewProviderBreaker(name string, maxRequests uint32) *gobreaker.CircuitBreaker {
	return gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        name,
		MaxRequests: maxRequests,
		Interval:    60 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5 ||
				(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			slog.Warn("熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
		},
	})
}
