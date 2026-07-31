# Performance SLO & k8s Standards

## API Latency SLOs

| Percentile | Target  | Window      | Burn Rate Fast (Page) | Burn Rate Slow (Ticket) |
| ---------- | ------- | ----------- | --------------------- | ----------------------- |
| P90        | < 100ms | 5m rolling  | P95 > 500ms / 1h      | P95 > 1s / 6h           |
| P99        | < 1s    | 5m rolling  | —                     | —                       |
| Error rate | < 0.1%  | 30d rolling | > 2%/h                | > 5%/6h                 |

## Frontend Page Load SLO

| Metric                  | Target        | Measurement                                  |
| ----------------------- | ------------- | -------------------------------------------- |
| Route navigation timing | < 100ms (P95) | `[Performance/navigation]` via RUM           |
| Initial page load (FCP) | < 500ms (P95) | `performance.getEntriesByType('navigation')` |
| Web Vital LCP           | < 2.5s        | `web-vitals` library                         |

## k8s Pod Resource Standards

| Service             | Requests (CPU/Mem) | Limits (CPU/Mem) |
| ------------------- | ------------------ | ---------------- |
| api (Express)       | 250m / 256Mi       | 1 / 512Mi        |
| frontend (Vite/SSR) | 100m / 128Mi       | 500m / 256Mi     |
| engine-go           | 500m / 512Mi       | 2 / 1Gi          |
| data-fetcher (Go)   | 200m / 256Mi       | 1 / 512Mi        |
| worker (BullMQ)     | 200m / 256Mi       | 1 / 512Mi        |
| redis               | 200m / 256Mi       | 1 / 512Mi        |
| postgres            | 500m / 1Gi         | 2 / 2Gi          |

## HPA Thresholds

| Service      | Metric             | Target            | Min/Max Pods |
| ------------ | ------------------ | ----------------- | ------------ |
| api          | CPU / Memory / P99 | 70% / 80% / 800ms | 2 / 10       |
| engine-go    | CPU / Queue depth  | 70% / 100         | 2 / 8        |
| data-fetcher | CPU                | 70%               | 2 / 6        |
| worker       | Queue depth        | 50                | 1 / 4        |

## Pod Anti-Affinity

- api, engine-go, data-fetcher: `preferredDuringSchedulingIgnoredDuringExecution` 跨 zone 拓扑分布
- postgres, redis: StatefulSet `requiredDuringSchedulingIgnoredDuringExecution`

## Load Test Thresholds (k6)

| Scenario                                  | VUs             | P99 SLA           | Error Rate SLA |
| ----------------------------------------- | --------------- | ----------------- | -------------- |
| Backtest submit / Optimizer submit        | 100 / 50        | < 500ms / < 300ms | < 5%           |
| Price history / Announcements / Data meta | 500 / 200 / 200 | < 200ms           | < 5% / < 2%    |

## Escalation

- **Notice** (P90 > 100ms): 24h 内评审，检查缓存命中与 DB 慢查询
- **Warning** (P99 > 1s): 1h 内排查，潜在事故
- **Critical** (P95 > 500ms fast burn): 立即 call on-call
