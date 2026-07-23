// Package provider 提供数据源接口、注册表与跨 provider 共享的基础设施。
package provider

import (
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/sony/gobreaker"
)

// ============================================================
// 类型定义
// ============================================================

// DailyPrice 日线行情数据（所有数据源共用）
type DailyPrice struct {
	Date          string
	Open          float64
	High          float64
	Low           float64
	Close         float64
	Volume        int64
	AdjustedClose float64
}

// TickerInfo 标的搜索结果（所有数据源共用）
type TickerInfo struct {
	Ticker   string
	Name     string
	Market   string
	Exchange string
}

// Provider 数据源接口
type Provider interface {
	Name() string
	FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error)
	SearchTicker(query string) ([]TickerInfo, error)
}

// ============================================================
// 注册表
// ============================================================

// Registry 多数据源注册表，支持按优先级降级
type Registry struct {
	providers  map[string]Provider
	priorities []string
}

// NewRegistry 创建注册表并按 priorities 指定的顺序排列降级链
func NewRegistry(priorities []string) *Registry {
	return &Registry{
		providers:  make(map[string]Provider),
		priorities: priorities,
	}
}

// Register 注册一个数据源
func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
	slog.Info("注册数据源", "provider", p.Name())
}

// ForTicker 返回该 ticker 适用的数据源列表（按优先级降级顺序）
// 支持 .SZ/.SH（点号）和 _SZ/_SH（下划线）两种格式
func (r *Registry) ForTicker(ticker string) []Provider {
	upper := strings.ToUpper(ticker)
	if strings.HasSuffix(upper, ".SZ") || strings.HasSuffix(upper, ".SH") ||
		strings.HasSuffix(upper, "_SZ") || strings.HasSuffix(upper, "_SH") {
		// A 股仅使用 akshare
		providers := r.forMarket("akshare")
		if len(providers) > 0 {
			return providers
		}
		// akshare 不可用时回退到通用链
		return r.forMarket(r.priorities...)
	}
	return r.forMarket(r.priorities...)
}

func (r *Registry) forMarket(allow ...string) []Provider {
	var result []Provider
	for _, name := range r.priorities {
		for _, allowed := range allow {
			if name == allowed {
				if p, ok := r.providers[name]; ok {
					result = append(result, p)
				}
				break
			}
		}
	}
	return result
}

// FetchWithFallback 按降级链依次尝试获取数据，全部失败返回错误
func FetchWithFallback(providers []Provider, ticker, startDate, endDate string) ([]DailyPrice, string, error) {
	var lastErr error
	for _, p := range providers {
		prices, err := p.FetchStockDaily(ticker, startDate, endDate)
		if err == nil {
			return prices, p.Name(), nil
		}
		lastErr = err
		slog.Warn("数据源获取失败，切换到下一个",
			"provider", p.Name(),
			"ticker", ticker,
			"error", err,
		)
	}
	return nil, "", fmt.Errorf("所有数据源均失败: %w", lastErr)
}

// ============================================================
// 交易所推导
// ============================================================

// exchange 后缀正则：同时支持点号（000001.SZ）与下划线（000001_SZ）两种格式。
// (?i) 使匹配大小写不敏感，与 backend 的 deriveExchangeFromTicker 保持一致（Task 4.5）。
var (
	reSZExchange  = regexp.MustCompile(`(?i)[._]SZ$`)
	reSSEExchange = regexp.MustCompile(`(?i)[._](SS|SH)$`)
)

// DeriveExchange 按 ticker 后缀推导交易所代码。
//
//	_SZ / .SZ  → SZSE（深圳证券交易所）
//	_SS / .SS  → SSE（上海证券交易所）
//	_SH / .SH  → SSE（上海证券交易所）
//	其余无后缀 → US（美国市场；后续可由 Yahoo provider 细化为 NASDAQ/NYSE）
//
// 用于在 data-fetcher 抓取行情时填充 tickers.exchange 列，使按交易所分布统计
// 不再全部显示"未知"。exchange 由 ticker 确定性推导，重复调用幂等。
func DeriveExchange(ticker string) string {
	if reSZExchange.MatchString(ticker) {
		return "SZSE"
	}
	if reSSEExchange.MatchString(ticker) {
		return "SSE"
	}
	return "US"
}

// ============================================================
// 熔断器
// ============================================================

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
