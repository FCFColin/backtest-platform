# ADR-044: OTel SaaS 替换

> **企业理由**：engine-go 与 data-fetcher 原各自维护 100% 相同的 OTel 初始化代码（~70 行），
> 违反 DRY。自建 OTel Collector 需持续投入运维成本（部署、升级、容量规划、故障排查），
> 且团队规模与 trace 流量不足以摊销该成本。SaaS 后端（Honeycomb / Datadog / Axiom）
> 提供等价能力的同时移除运维负担，并通过标准 OTel 环境变量实现供应商无锁定切换。

| 字段   | 值                                                                                 |
| ------ | ---------------------------------------------------------------------------------- |
| 编号   | ADR-044                                                                            |
| 状态   | 已接受                                                                             |
| 日期   | 2026-07-20                                                                         |
| 决策者 | 架构组                                                                             |
| 范围   | engine-go + data-fetcher 的 OTel 初始化；`packages/go-shared/observability/`       |
| 关联   | ADR-008（Go + TypeScript 架构）、ADR-015（可观测性技术选型，Collector 部分被取代） |

## Context

engine-go/internal/observability/otel.go 与 data-fetcher/internal/observability/otel.go
是 100% 相同的代码（~70 行），各自维护一份。同时 ADR-015 原定 Collector 架构
（各服务 → OTel Collector → Jaeger/Tempo + Prometheus）要求团队自建并运维 Collector 实例，
对小规模团队是显著的运维负担。

候选方案：

- **方案 A：抽取共享 module + SaaS 替换**：新建 `packages/go-shared/observability/otel.go`
  作为单一权威实现，engine-go 与 data-fetcher 通过 `replace` 指令引用；exporter 通过
  `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量切换到 SaaS 后端，移除自建 Collector 依赖。
- **方案 B：仅抽取共享 module，保留自建 Collector**：消除重复代码但保留 Collector 运维。
- **方案 C：维持现状**：两服务各自维护 OTel 代码 + 自建 Collector。

## Decision

采用方案 A：抽取 `packages/go-shared/observability/otel.go` 共享 module，
同时通过标准 OTel 环境变量切换到 SaaS 后端。

### 共享 module 抽取

- 新建 `packages/go-shared/` Go module（`module github.com/backtest/go-shared`）
- `packages/go-shared/observability/otel.go` 合并两服务的 OTel 初始化代码
- engine-go 与 data-fetcher 的 `go.mod` 添加 `replace github.com/backtest/go-shared => ../packages/go-shared`
- 原两服务的 `internal/observability/otel.go` 改为 re-export from `go-shared/observability`
- 顺手抽取 `pprof` / `http.Server` / `slog` / `securityHeadersMiddleware` 到 `packages/go-shared/`

### SaaS 切换机制

通过 OpenTelemetry Go SDK 标准环境变量控制：

- `OTEL_EXPORTER_OTLP_ENDPOINT`：OTLP 接收端点（如 `https://api.honeycomb.io`）
- `OTEL_EXPORTER_OTLP_HEADERS`：鉴权头，逗号分隔（如 `x-honeycomb-team=YOUR_KEY`）

未设置端点时，trace 仅进程内（无导出），适合本地开发。设置后 trace 通过 OTLP HTTP
直接导出到 SaaS 后端，无需自建 Collector 中转。

### SaaS 供应商选择

不在本 ADR 强制指定单一供应商。通过环境变量切换，可在 Honeycomb / Datadog / Axiom
之间无代码改动切换。供应商选择由部署环境配置决定。

## Consequences

- (+) 削减 ~70 行跨服务 100% 重复代码 + ~44 行 pprof/slog/httpServer/securityHeaders 跨服务重复
- (+) SaaS 切换灵活，通过环境变量即可在供应商间迁移，无供应商锁定
- (+) 移除自建 Collector 运维负担（部署、升级、容量规划、故障排查）
- (+) 本地开发体验改善：不设置端点即跳过导出，无需启动 Collector
- (-) 增加 SaaS 后端外部依赖：供应商可用性影响 trace 可观测性
- (-) SaaS 调用产生网络延迟（通常 <100ms，可接受）
- (-) 跨网络导出 trace 数据需注意 PII / 敏感信息过滤（由 OTel SDK 的 sanitization 处理）
- (-) ADR-015 的 Collector 架构部分被本 ADR 取代（指标仍走 Prometheus 直连，不走 SaaS）

## 实施状态

- ✅ `packages/go-shared/observability/otel.go` 已创建，支持 `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`
- ✅ `packages/go-shared/http/pprof.go` + `server.go` + `log/log.go` + `middleware/security.go` 已抽取
- ✅ engine-go + data-fetcher 的 `go.mod` 已添加 `replace` 指令
- ✅ engine-go + data-fetcher 的 `internal/observability/otel.go` 已改为 re-export
- ✅ `go vet` + `go build` + `go test` 在两服务全部通过
