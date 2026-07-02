package provider

import (
	"fmt"
	"log/slog"
	"strings"
)

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
