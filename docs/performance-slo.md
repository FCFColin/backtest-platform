# Performance SLO & k8s Standards

## API Latency SLOs

| Percentile | Target  | Window      | Burn Rate Fast (Page) | Burn Rate Slow (Ticket) |
| ---------- | ------- | ----------- | --------------------- | ----------------------- |
| P90        | < 100ms | 5m rolling  | P95 > 500ms / 1h      | P95 > 1s / 6h           |
| P99        | < 1s    | 5m rolling  | —                     | —                       |
| Error rate | < 0.1%  | 30d rolling | > 2%/h                | > 5%/6h                 |

## Frontend Page Load SLO

| Metric                  | Target        | Measurement                                |
| ----------------------- | ------------- | ------------------------------------------ |
| Route navigation timing | < 700ms (P95) | `PAGE_LOAD_BUDGET_NAV`(e2e page-load spec) |
| Initial page load (FCP) | < 700ms (P95) | `PAGE_LOAD_BUDGET_FCP`(e2e page-load spec) |
| Web Vital LCP           | < 2.5s        | `web-vitals` library                       |

## k8s 资源标准

权威源：`k8s/deployments.yaml`（资源/探针）、`k8s/hpas.yaml`（HPA）、`k8s/overlays/production/`（overlay patch）。摘要：

- api: 500m/256Mi → 1/1Gi, HPA 70% CPU (2–10 pods)
- engine-go: 1/512Mi → 2/2Gi, HPA 70% CPU (2–10 pods)
- data-fetcher: 500m/256Mi → 1/512Mi, HPA 70% CPU (2–6 pods)
- worker: 500m/512Mi → 1/1Gi, HPA 70% CPU (1–5 pods); production overlay 1CPU/1Gi → 2CPU/2Gi
- postgres: 250m/128Mi → 500m/256Mi（单副本，无 HPA）
- redis: 未配置资源限制

Pod Anti-Affinity: api/engine-go/data-fetcher 跨 zone 拓扑分布（production overlay）；postgres/redis 单点依赖存储层备份兜底。
内存/P99/队列深度指标未配置（需 prometheus-adapter/KEDA external metrics）。

## Escalation

- **Notice** (P90 > 100ms): 24h 内评审，检查缓存命中与 DB 慢查询
- **Warning** (P99 > 1s): 1h 内排查，潜在事故
- **Critical** (P95 > 500ms fast burn): 立即 call on-call
