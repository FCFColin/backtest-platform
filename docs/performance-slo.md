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

## k8s Pod Resource Standards（与 k8s/deployments.yaml、postgres.yaml 一致）

| Service           | Requests (CPU/Mem) | Limits (CPU/Mem) |
| ----------------- | ------------------ | ---------------- |
| api (Express)     | 500m / 256Mi       | 1 / 1Gi          |
| frontend (nginx)  | 100m / 64Mi        | 500m / 256Mi     |
| engine-go         | 1 / 512Mi          | 2 / 2Gi          |
| data-fetcher (Go) | 500m / 256Mi       | 1 / 512Mi        |
| worker (BullMQ)   | 500m / 512Mi       | 1 / 1Gi          |
| redis             | 未配置             | 未配置           |
| postgres          | 250m / 128Mi       | 500m / 256Mi     |

## HPA Thresholds（与 k8s/hpas.yaml 一致；均为 CPU 指标）

| Service      | Metric | Target | Min/Max Pods |
| ------------ | ------ | ------ | ------------ |
| api          | CPU    | 70%    | 2 / 10       |
| engine-go    | CPU    | 70%    | 2 / 10       |
| data-fetcher | CPU    | 70%    | 2 / 6        |
| worker       | CPU    | 70%    | 1 / 5        |

内存/P99/队列深度指标未配置（需部署 prometheus-adapter/KEDA 的 external metrics，当前未纳入）。

## Pod Anti-Affinity

- api, engine-go, data-fetcher: `preferredDuringSchedulingIgnoredDuringExecution` 跨 zone 拓扑分布（production overlay）
- postgres（单副本）、redis（StatefulSet 头节点）：未配置反亲和，单点依赖由存储层备份/故障转移兜底

> worker 资源以 production overlay 为准：requests 1 CPU / 1Gi、limits 2 CPU / 2Gi（`k8s/overlays/production` patch 覆盖上表 base 值）

## Escalation

- **Notice** (P90 > 100ms): 24h 内评审，检查缓存命中与 DB 慢查询
- **Warning** (P99 > 1s): 1h 内排查，潜在事故
- **Critical** (P95 > 500ms fast burn): 立即 call on-call
