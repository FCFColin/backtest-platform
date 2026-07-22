// Package observability 提供 OpenTelemetry 与 Prometheus 指标初始化的 re-export 入口。
//
// 实现已收口到 github.com/backtest/go-shared/observability，本包仅作为 engine-go
// 内部消费方的稳定 import 路径（避免大规模改动 import）。
//
// 企业理由（ADR-015 + OTel SaaS 替换）：原 engine-go 与 data-fetcher 各自维护
// 100% 相同的 OTel 初始化代码，DRY 收口到 go-shared 后支持通过环境变量切换 SaaS 后端。
package observability

import (
	"context"
	"net/http"

	gosharedobs "github.com/backtest/go-shared/observability"
)

// Init 初始化 TracerProvider 与 Prometheus Registry。
// 返回 shutdown 函数与 /metrics 处理器。
func Init(serviceName string) (shutdown func(context.Context) error, metrics http.Handler, err error) {
	return gosharedobs.Init(serviceName)
}

// MustInit 包装 Init；失败时记录警告并返回 noop shutdown + 空 registry handler。
func MustInit(serviceName string) (shutdown func(context.Context) error, metrics http.Handler) {
	return gosharedobs.MustInit(serviceName)
}
