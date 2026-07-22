// Package observability 提供 OpenTelemetry 与 Prometheus 指标初始化的 re-export 入口。
//
// 实现已收口到 github.com/backtest/go-shared/observability，本包仅作为 data-fetcher
// 内部消费方的稳定 import 路径。
package observability

import (
	"context"
	"net/http"

	gosharedobs "github.com/backtest/go-shared/observability"
)

// Init 初始化 TracerProvider 与 Prometheus /metrics 处理器。
func Init(serviceName string) (shutdown func(context.Context) error, metrics http.Handler, err error) {
	return gosharedobs.Init(serviceName)
}

// MustInit 失败时不阻止服务启动。
func MustInit(serviceName string) (shutdown func(context.Context) error, metrics http.Handler) {
	return gosharedobs.MustInit(serviceName)
}
