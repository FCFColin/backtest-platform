// Package observability 提供 OpenTelemetry 与 Prometheus 指标初始化的跨服务共享实现。
//
// 企业理由（ADR-015 + OTel SaaS 替换决策）：engine-go 与 data-fetcher 原各自维护
// 100% 相同的 OTel 初始化代码（~70 行），违反 DRY。本包收口为单一权威实现，
// 同时支持通过标准 OTel 环境变量切换 SaaS 后端（Honeycomb / Datadog / Axiom），
// 移除对自建 collector 的依赖。
//
// 支持的环境变量（OpenTelemetry Go SDK 标准）：
//   - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP 接收端点（如 https://api.honeycomb.io）
//   - OTEL_EXPORTER_OTLP_HEADERS: 鉴权头，逗号分隔（如 x-honeycomb-team=YOUR_KEY）
package observability

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"

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

// Init 初始化 TracerProvider 与 Prometheus /metrics 处理器。
//
// 当 OTEL_EXPORTER_OTLP_ENDPOINT 设置时，trace 通过 OTLP HTTP 导出到 SaaS 后端
// （Honeycomb / Datadog / Axiom）。OTEL_EXPORTER_OTLP_HEADERS 用于注入鉴权头。
// 未设置端点时，trace 仅进程内（无导出），适合本地开发。
//
// 返回 shutdown 函数（应 defer 调用以 flush span）与 /metrics 处理器。
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
		opts := []otlptracehttp.Option{otlptracehttp.WithEndpointURL(endpoint)}
		if headers := parseOTLPHeaders(os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")); len(headers) > 0 {
			opts = append(opts, otlptracehttp.WithHeaders(headers))
		}
		exporter, expErr := otlptracehttp.New(ctx, opts...)
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

// parseOTLPHeaders 解析 OTEL_EXPORTER_OTLP_HEADERS 环境变量。
// 格式: "key1=value1,key2=value2"（与 OTel SDK 标准一致）。
func parseOTLPHeaders(raw string) map[string]string {
	headers := make(map[string]string)
	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		k, v, ok := strings.Cut(pair, "=")
		if !ok {
			continue
		}
		headers[strings.TrimSpace(k)] = strings.TrimSpace(v)
	}
	return headers
}
