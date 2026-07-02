// Package observability — data-fetcher 的 OTel + Prometheus 初始化（T-B5）。
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

// Init 初始化 TracerProvider 与 Prometheus /metrics 处理器。
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

	if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); endpoint != "" {
		exporter, expErr := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(endpoint))
		if expErr != nil {
			slog.Warn("OTel exporter 初始化失败", "error", expErr)
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

// MustInit 失败时不阻止服务启动。
func MustInit(serviceName string) (shutdown func(context.Context) error, metrics http.Handler) {
	shutdownFn, handler, err := Init(serviceName)
	if err != nil {
		slog.Warn("observability 初始化失败", "service", serviceName, "error", err)
		reg := prometheus.NewRegistry()
		return func(context.Context) error { return nil }, promhttp.HandlerFor(reg, promhttp.HandlerOpts{})
	}
	return shutdownFn, handler
}
