// Package provider 提供数据源接口、注册表与跨 provider 共享的基础设施。
package provider

import (
	"fmt"
	"github.com/sony/gobreaker"
	"log/slog"
	"regexp"
	"strings"
	"time"
)

type DailyPrice struct {
	Date          string
	Open          float64
	High          float64
	Low           float64
	Close         float64
	Volume        int64
	AdjustedClose float64
}
type TickerInfo struct {
	Ticker   string
	Name     string
	Market   string
	Exchange string
}
type Provider interface {
	Name() string
	FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error)
	SearchTicker(query string) ([]TickerInfo, error)
}
type Registry struct {
	providers  map[string]Provider
	priorities []string
}

func NewRegistry(priorities []string) *Registry {
	return &Registry{providers: make(map[string]Provider), priorities: priorities}
}
func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
	slog.Info("注册数据源", "provider", p.Name())
}
func (r *Registry) ForTicker(ticker string) []Provider {
	upper := strings.ToUpper(ticker)
	if strings.HasSuffix(upper, ".SZ") || strings.HasSuffix(upper, ".SH") ||
		strings.HasSuffix(upper, "_SZ") || strings.HasSuffix(upper, "_SH") {
		providers := r.forMarket("akshare")
		if len(providers) > 0 {
			return providers
		}
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

var (
	reSZExchange  = regexp.MustCompile(`(?i)[._]SZ$`)
	reSSEExchange = regexp.MustCompile(`(?i)[._](SS|SH)$`)
)

func DeriveExchange(ticker string) string {
	if reSZExchange.MatchString(ticker) {
		return "SZSE"
	}
	if reSSEExchange.MatchString(ticker) {
		return "SSE"
	}
	return "US"
}
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
