# ADR-009: 可观测性技术选型

## Status: Accepted

## Context
系统需要结构化日志、指标采集、分布式追踪三支柱可观测性。
Node.js/Go/Rust 三语言服务需要统一的可观测性方案。

## Decision
- 日志：pino（Node.js）、slog（Go）、tracing（Rust）— 结构化 JSON 输出
- 指标：prom-client（Node.js）、prometheus/client_golang（Go）— Prometheus 格式
- 追踪：OpenTelemetry SDK（三语言统一）— W3C Trace Context 传播
- DB 追踪：@opentelemetry/instrumentation-pg — 自动为 pg 查询创建 span
- Collector：OTel Collector → Jaeger/Tempo

## Consequences
- 优势：三语言统一 OTel 标准，跨服务 trace 可串联
- 劣势：OTel SDK 增加约 5MB 依赖和微秒级开销
- 风险：enhancedDatabaseReporting 需配合采样避免高基数
