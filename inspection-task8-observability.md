# Observability Inspection Report

**Inspected:** `packages/backend/src/utils/logger.ts`, `packages/backend/src/utils/metrics.ts`, `packages/backend/src/middleware/auditLog.ts`, `packages/backend/src/tracing.ts`, `docs/logging-policy.md`, `docs/alerts/burn-rate.yml`

## Logging

- **Framework:** `pino` + `pino-http`
- **Level:** `debug` (development) / `info` (production)
- **Redaction paths:** `req.headers.authorization`, `req.headers["x-api-key"]`, `req.headers.cookie`, `*.password`, `*.token`, `*.secret`, `*.apiKey` — censored as `[Redacted]`
- **Mixin:** OTel `trace_id`/`span_id` injected into every log line
- **HTTP log levels:** 4xx → `warn`, 5xx → `error`, rest → `info`
- **Request ID:** from `x-request-id` header (validated with `[a-zA-Z0-9-]+`, max 128 chars) or generated `randomUUID`

## Audit Log Coverage

- **File:** `packages/backend/src/middleware/auditLog.ts`
- **Scope:** Only write operations (`POST`, `PUT`, `PATCH`, `DELETE`)
- **Capture:** timestamp, method, path, userId, IP, userAgent, statusCode, result
- **User ID:** JWT `sub` claim preferred, falls back to SHA-256 hash of `x-api-key`, then `anonymous`
- **Outbox:** Dual-writes to `outbox` table via `writeOutboxEvent()` with HMAC-SHA256 signing for tamper detection. Transactional mode (accepts `PoolClient`) and standalone mode both supported.
- **Missing:** No read operations tracked (by design — only high-risk mutations)

## Custom Metrics Defined (`metrics.ts`)

| Metric                                     | Type                     | Labels                           |
| ------------------------------------------ | ------------------------ | -------------------------------- |
| `node_eventloop_lag_seconds`               | Gauge (P99, sampled 10s) | —                                |
| `circuit_breaker_state`                    | Gauge                    | `name`                           |
| `data_service_semaphore_permits_available` | Gauge                    | `name`                           |
| `data_service_semaphore_permits_total`     | Gauge                    | `name`                           |
| `http_request_duration_seconds`            | Histogram (10 buckets)   | `method`, `route`, `status_code` |
| `http_requests_total`                      | Counter                  | `method`, `route`, `status_code` |
| `rust_engine_calls_total`                  | Counter                  | `result`                         |
| `rust_engine_call_duration_seconds`        | Histogram (7 buckets)    | `result`                         |
| `fallback_to_node_total`                   | Counter                  | `reason`                         |
| `backtest_requests_total`                  | Counter                  | `endpoint`, `mode`, `status`     |
| `degraded_responses_total`                 | Counter                  | `endpoint`, `reason`             |
| `pg_pool_waiting_count`                    | Gauge                    | `pool`                           |
| `pg_pool_total_connections`                | Gauge                    | `pool`                           |

Default process metrics (CPU/memory/GC) collected via `client.collectDefaultMetrics({ register })`.

## Circuit Breaker Metrics

`registerCircuitBreakerMetrics` is wired for **3 breakers:**

1. `go_engine` — in `engineClient.ts:104`
2. `go_data_service` — in `dataRoutes.ts:137`
3. `postgres` — in `dataService.ts:112`

State mapping: `0=closed`, `1=open`, `2=halfOpen`.

## Tracing Configuration

- **Library:** OpenTelemetry NodeSDK v1
- **Service name:** `backtest-platform-api`
- **Exporters:** OTLP HTTP/proto traces (to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`); optional OTLP metrics exporter (separate endpoint)
- **Auto-instrumentations:** http/https, express, fetch, net, dns; `fs` explicitly disabled
- **PgInstrumentation:** Enhanced DB reporting enabled (SQL text + params in spans)
- **Fallback:** No exporter configured = stdout only (no-op in production)
- **Init:** `initTracing()` called before server start; graceful shutdown on `SIGTERM`
- **Error handling:** OTel init failure logged as warning, does not block app start

## Documentation Completeness

- `docs/logging-policy.md` — Covers levels, required fields, HTTP log behavior, redaction pointers. Concise (35 lines). Lacks a worked example of reading logs in production.
- `docs/alerts/burn-rate.yml` — 4 alert rules (fast/slow burn for error rate + latency P95). Aligned with SRE best practices. Missing alert for circuit breaker open states and event loop lag.

## Overall Assessment

**Grade: B** — Production-capable with gaps.

| Area          | Verdict                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Logging       | Strong. Structured, redacted, correlated via request_id + trace_id.                                                                   |
| Audit Log     | Well-designed. Write-only (intentional), dual-write with outbox, HMAC integrity.                                                      |
| Metrics       | Comprehensive. Covers Google SRE 4 golden signals (latency, traffic, errors, saturation).                                             |
| Tracing       | Good. OTel with auto-instrumentation, PgInstrumentation, decoupled metrics endpoint.                                                  |
| Alerting      | Minimal. Only burn-rate rules defined. Missing: circuit breaker open alerts, event loop lag, degraded response rate, pool saturation. |
| Documentation | Adequate but sparse. Alert rules lack runbook detail and on-call rotation info.                                                       |
