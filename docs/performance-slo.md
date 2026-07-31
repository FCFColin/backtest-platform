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

### Resource Requests (minimum guaranteed)

| Service             | CPU Request | Memory Request |
| ------------------- | ----------- | -------------- |
| api (Express)       | 250m        | 256Mi          |
| frontend (Vite/SSR) | 100m        | 128Mi          |
| engine-go           | 500m        | 512Mi          |
| data-fetcher (Go)   | 200m        | 256Mi          |
| worker (BullMQ)     | 200m        | 256Mi          |
| redis               | 200m        | 256Mi          |
| postgres            | 500m        | 1Gi            |

### Resource Limits (hard ceiling)

| Service             | CPU Limit | Memory Limit |
| ------------------- | --------- | ------------ |
| api (Express)       | 1         | 512Mi        |
| frontend (Vite/SSR) | 500m      | 256Mi        |
| engine-go           | 2         | 1Gi          |
| data-fetcher (Go)   | 1         | 512Mi        |
| worker (BullMQ)     | 1         | 512Mi        |
| redis               | 1         | 512Mi        |
| postgres            | 2         | 2Gi          |

### HPA (Horizontal Pod Autoscaler) Thresholds

| Service      | Metric               | Target | Min Pods | Max Pods |
| ------------ | -------------------- | ------ | -------- | -------- |
| api          | CPU utilization      | 70%    | 2        | 10       |
| api          | Memory utilization   | 80%    | 2        | 10       |
| api          | HTTP P99 latency     | 800ms  | 2        | 10       |
| engine-go    | CPU utilization      | 70%    | 2        | 8        |
| engine-go    | Queue depth (BullMQ) | 100    | 2        | 8        |
| data-fetcher | CPU utilization      | 70%    | 2        | 6        |
| worker       | Queue depth          | 50     | 1        | 4        |

### Pod Anti-Affinity

- api, engine-go, data-fetcher: `preferredDuringSchedulingIgnoredDuringExecution` with topology spread across zones
- postgres, redis: StatefulSet with `requiredDuringSchedulingIgnoredDuringExecution` anti-affinity

## Load Test Thresholds (k6)

| Scenario         | VUs | P99 SLA | Error Rate SLA |
| ---------------- | --- | ------- | -------------- |
| Backtest submit  | 100 | < 500ms | < 5%           |
| Price history    | 500 | < 200ms | < 5%           |
| Optimizer submit | 50  | < 300ms | < 5%           |
| Announcements    | 200 | < 200ms | < 2%           |
| Data meta        | 200 | < 200ms | < 2%           |

## Escalation

- **Notice** (P90 > 100ms): Review within 24h, check cache hit rates and DB slow queries
- **Warning** (P99 > 1s): Investigate within 1h, potential incident
- **Critical** (P95 > 500ms fast burn): Page on-call immediately
