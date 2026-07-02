// Package observability 提供 OpenTelemetry 与 Prometheus 指标初始化。
//
// 企业理由（ADR-015）：Go 引擎是计算主路径，无 OTel 则 Node→Go 调用链断裂，
// 100x 流量下无法定位慢请求根因。Prometheus /metrics 是 K8s 告警的基础。
// 权衡：OTel SDK 增加约 2MB 依赖与微秒级 span 开销，换取跨服务排障能力。
package observability

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

var metricsRegistry = prometheus.NewRegistry()

// Init 初始化 TracerProvider 与 Prometheus Registry。
// 返回 shutdown 函数与 /metrics 处理器。
func Init(serviceName string) (shutdown func(context.Context) error, metrics http.Handler, err error) {
	ctx := context.Background()

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, nil, err
	}

	tpOpts := []sdktrace.TracerProviderOption{sdktrace.WithResource(res)}

	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint != "" {
		exporter, expErr := otlptracehttp.New(ctx,
			otlptracehttp.WithEndpointURL(endpoint),
		)
		if expErr != nil {
			slog.Warn("OTel exporter 初始化失败，trace 仅进程内", "error", expErr)
		} else {
			tpOpts = append(tpOpts, sdktrace.WithBatcher(exporter))
		}
	}

	tp := sdktrace.NewTracerProvider(tpOpts...)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	metricsRegistry.MustRegister(
		prometheus.NewGoCollector(),
		prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}),
	)

	return tp.Shutdown, promhttp.HandlerFor(metricsRegistry, promhttp.HandlerOpts{}), nil
}

// MustInit 包装 Init；失败时记录警告并返回 noop shutdown + 空 registry handler。
func MustInit(serviceName string) (shutdown func(context.Context) error, metrics http.Handler) {
	shutdownFn, handler, err := Init(serviceName)
	if err != nil {
		slog.Warn("observability 初始化失败", "service", serviceName, "error", err)
		reg := prometheus.NewRegistry()
		return func(context.Context) error { return nil }, promhttp.HandlerFor(reg, promhttp.HandlerOpts{})
	}
	return shutdownFn, handler
}
