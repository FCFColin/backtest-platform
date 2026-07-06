# 切片07：部署运维成熟度

## Q1: CI/CD 完整性

### 证据

- `.github/workflows/` 目录不存在（glob 返回空）
- `docker-compose.yml` 末尾注释标明 `docker-compose up -d` 是部署方式，但无自动化 pipeline

### 分析

当前项目**完全没有 CI/CD pipeline**。GitHub Actions 目录完全缺失，没有 CI 步骤（lint/typecheck/test 自动化），没有 CD 步骤（staging/production 部署）。从 runbook 可见部署仍为纯手动操作（`docker-compose up -d` 或 K8s `kubectl apply`）。

### 结论

**严重缺失**。CI/CD 成熟度为 0。缺少 CI pipeline 意味着：

- merge 前无法自动执行 lint/typecheck/test 门控
- 无自动构建 + 推送镜像
- 无 staging/production 环境区分
- 无自动部署能力

---

## Q2: K8s vs Docker Compose 配置漂移

### 证据

| 对比维度            | docker-compose.yml                                             | k8s manifests                                                                                        | 一致？                       |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| **前端服务**        | 独立 `frontend` 服务（nginx:stable-alpine, port 80）           | 无独立前端 Deployment；ingress 直接指向 `frontend-api` Service（:5001），前端静态文件内嵌于 API 镜像 | ❌ k8s 缺少 nginx 层         |
| **API 镜像**        | 构建自 `Dockerfile.backend`                                    | image: `backtest-platform/frontend-api`（名不同）                                                    | ❌                           |
| **Redis**           | 完整配置（redis:7-alpine, port 6379, healthcheck）             | k8s 中**完全缺失**（无 Redis Deployment/Service）                                                    | ❌ 严重缺失                  |
| **PostgreSQL 镜像** | `postgres:16-alpine@sha256:e013e...`（digest pin）             | `postgres:16-alpine`（无 digest）                                                                    | ❌                           |
| **PostgreSQL 资源** | 无 limits/requests                                             | 128Mi/0.25 CPU（request），256Mi/0.5 CPU（limit）                                                    | ❌ docker-compose 无资源限制 |
| **引擎镜像**        | `engine-go/Dockerfile` 构建                                    | image: `backtest-platform/engine-go`（名不同）                                                       | ❌                           |
| **数据服务镜像**    | `data-fetcher/Dockerfile` 构建                                 | image: `backtest-platform/go-data`（名不同）                                                         | ❌                           |
| **引擎 env vars**   | `ENGINE_GO_PORT=5004`、`GIN_MODE=release`、`ENGINE_AUTH_TOKEN` | 通过 ConfigMap + Secret 注入，无 `ENGINE_GO_PORT`                                                    | ❌ 部分缺失                  |
| **数据服务 env**    | `DATA_FETCHER_PORT=5003`、`DATA_SERVICE_AUTH_TOKEN`            | 通过 ConfigMap + Secret，无 `DATA_FETCHER_PORT`                                                      | ❌ 部分缺失                  |
| **PgBouncer**       | 无                                                             | 完整配置（edoburu/pgbouncer:1.23.0, 2 副本, 200 max client）                                         | ❌ docker-compose 缺失       |
| **OTel Collector**  | 无                                                             | 完整配置（otel/opentelemetry-collector-contrib:0.119.0）                                             | ❌ docker-compose 缺失       |
| **HPA**             | 无                                                             | api-hpa.yaml（min:2, max:10, CPU@70%）                                                               | ❌ docker-compose 缺失       |
| **PDB**             | 无                                                             | 3 个 PDB（api/engine-go/go-data, minAvailable:1）                                                    | ❌ docker-compose 缺失       |
| **ConfigMap**       | 无（env 内联）                                                 | backtest-config（含 `ENGINE_TIMEOUT_MS: '5000'` 等）                                                 | ❌                           |

### 分析

K8s 和 Docker Compose 之间存在**严重配置漂移**：

1. **Redis 完全缺失**：docker-compose 中有 Redis，但 k8s 中无任何 Redis 相关 manifest。k8s 部署根本无法使用会话/限流/缓存/任务队列功能。
2. **PgBouncer / OTel Collector / HPA / PDB**：仅在 k8s 中存在，docker-compose 没有——这是合理的（生产增强），但开发环境无法复现生产拓扑。
3. **镜像命名不统一**：k8s 的镜像名与 Dockerfile 产出的镜像名不匹配，需人肉确认构建流程。
4. **PostgreSQL 镜像安全差异**：docker-compose pin digest，k8s 使用可变 tag。
5. **k8s 无前端 nginx 层**：前端静态文件由 API Pod 直接托管，生产环境失去 nginx 的反向代理/缓存/压缩能力。

### 结论

**严重漂移**。K8s 和 Docker Compose 不是同一套拓扑的两个变体，而是两套独立的配置。核心差异（Redis 缺失）会导致 k8s 部署功能不完整。建议使用 Helm 或 Kustomize 统一管理。

---

## Q3: 可观测性告警覆盖关键 SLO

### 证据

- `docs/alerts/burn-rate.yml`：定义了 4 个告警规则（Fast/Slow Burn × Error Rate/Latency）
- `packages/backend/src/utils/metrics.ts`：定义了丰富的自定义指标
- `docs/runbook.md`：SLO 目标（可用性 99.5%、P95 < 2s、错误率 < 1%）

**已有指标覆盖**（metrics.ts）：

| 指标                                       | 类型      | 有告警？                                                |
| ------------------------------------------ | --------- | ------------------------------------------------------- |
| `http_request_duration_seconds`            | Histogram | ✅ P95 > 2s（Fast Burn）/ > 3s（Slow Burn）             |
| `http_requests_total` (by status_code)     | Counter   | ✅ 5xx rate > 0.1%（Fast Burn）/ > 0.0347%（Slow Burn） |
| `node_eventloop_lag_seconds`               | Gauge     | ❌ 无告警                                               |
| `circuit_breaker_state`                    | Gauge     | ❌ 无告警                                               |
| `go_engine_calls_total`                    | Counter   | ❌ 无告警                                               |
| `go_engine_call_duration_seconds`          | Histogram | ❌ 无告警                                               |
| `degraded_responses_total`                 | Counter   | ❌ 无告警                                               |
| `pg_pool_waiting_count`                    | Gauge     | ❌ 无告警                                               |
| `pg_pool_total_connections`                | Gauge     | ❌ 无告警                                               |
| `data_service_semaphore_permits_available` | Gauge     | ❌ 无告警                                               |
| `backtest_requests_total`                  | Counter   | ❌ 无告警                                               |
| `fallback_to_node_total`                   | Counter   | ❌ 无告警                                               |

### 分析

告警规则仅覆盖错误率和延迟的 SLO burn rate。以下关键风险点**无告警覆盖**：

1. **熔断器状态**（`circuit_breaker_state == 1`）：熔断器 Open 意味着服务降级，是可用性关键信号，但无告警。
2. **降级响应率**（`degraded_responses_total`）：持续升高是依赖故障的早期信号，但无告警。
3. **连接池饱和度**（`pg_pool_waiting_count`）：等待队列非零是 DB 瓶颈的 leading indicator，但无告警。
4. **Go 引擎调用失败**（`go_engine_calls_total{result="fallback"}`）：没有告警。
5. **事件循环延迟**（`node_eventloop_lag_seconds`）：指标已定义但无告警。

### 结论

**部分覆盖**。SLO burn rate 告警设计良好（快速/慢速燃烧分离 + Google SRE Workbook 实践），但基础设施层面的关键信号（熔断器、降级、连接池、事件循环）完全没有告警规则。

---

## Q4: 灾备策略完整性

### 证据

**PostgreSQL 持久化**：

- docker-compose：`pgdata` named volume，绑定到 `/var/lib/postgresql/data`
- k8s：StatefulSet + PVC 模板（1Gi），`volumeClaimTemplates` 确保 Pod 重建数据不丢失
- k8s postgres-replica：只读副本（1 副本），流复制配置

**Redis 持久化**：

- docker-compose.yml:46：`command: ['redis-server', '--save', '', '--appendonly', 'no']`
- **RDB 和 AOF 均关闭**，Redis 纯内存运行，重启即丢所有数据
- k8s 无 Redis 部署

**Go engine（有状态/无状态）**：

- `router.go:77` 注释确认：**无状态设计**（"stateless design"），所有 priceData 由调用方传入
- engine-go 无直接数据库连接（仅通过 API 层的 HTTP 调用获取数据）
- 可水平扩展（2 副本，PDB minAvailable:1）

**PDB 配置**：

- `api-pdb.yaml`：minAvailable:1（2 副本）
- `engine-go-pdb.yaml`：minAvailable:1（2 副本）
- `go-data-pdb.yaml`：minAvailable:1（2 副本）

**备份策略**：

- 无 PG 自动备份配置（如 pg_dump cronjob、WAL 归档）
- runbook 提到从"备份"恢复数据文件（`backup/tickers/`），但无自动化备份机制
- 无 disaster recovery 文档或演练

### 分析

**强项**：

- Go engine 无状态设计 + 多副本 + PDB，计算层灾备较好
- PG 使用 StatefulSet + PVC，数据持久化正确
- 三个核心服务均有 PDB，保障自愿驱逐时的可用性

**弱项**：

- **Redis 无持久化**（`--save '' --appendonly no`）：重启后丢失所有会话/限流/幂等数据，会导致用户被迫重新登录、限流计数器重置（可能超限或被绕过）
- **PG 单点故障**：StatefulSet replicas:1，主库故障需要手动切换
- **无备份机制**：没有 PG 自动备份、WAL 归档、或跨区域灾备
- **k8s 缺失 Redis**：即使灾备设计也不完整

### 结论

**部分覆盖，有重大缺口**。计算层（Go engine）灾备良好，但数据层（PG 单副本、Redis 无持久化、无备份）存在显著风险。

---

## Q5: Docker 镜像安全基线

### 证据

**Dockerfile（旧版全量镜像）**：

- `FROM node:20-alpine@sha256:fb4cd12c...` ✅ digest pin
- `USER node` ✅ 非 root
- `HEALTHCHECK` ✅

**Dockerfile.backend（API 镜像）**：

- `FROM node:20-alpine@sha256:fb4cd12c...` ✅ digest pin（builder + runner 均 pin）
- `USER node` ✅ 非 root
- `HEALTHCHECK` ✅

**Dockerfile.frontend（nginx 镜像）**：

- Builder: `FROM node:20-alpine@sha256:fb4cd12c...` ✅
- Runner: `FROM nginx:stable-alpine@sha256:67b3cf4d...` ✅
- `USER nginx` ✅ 非 root
- `HEALTHCHECK` ✅

**Dockerfile.distroless（ADR-030 PoC）**：

- Runner: `FROM gcr.io/distroless/nodejs20-debian12:nonroot` ✅ distroless + nonroot
- 无 shell，缩小攻击面
- 但：无 HEALTHCHECK（依赖 K8s HTTP probe）

**engine-go/Dockerfile**：

- Builder: `FROM golang:1.25-alpine@sha256:000000...` ❌ **placeholder digest**（全零 hash，不会被 Renovate 更新）
- Runner: `FROM alpine:3.20@sha256:d9e853e8...` ✅
- `RUN adduser -D -u 1000 appuser` / `USER appuser` ✅ 非 root
- `HEALTHCHECK` ✅

**data-fetcher/Dockerfile**：

- Builder: `FROM golang:1.22-alpine@sha256:1699c100...` ✅
- Runner: `FROM alpine:3.20@sha256:d9e853e8...` ✅
- `RUN adduser -D -u 1000 appuser` / `USER appuser` ✅

**K8s manifests（独立于 Dockerfile 的问题）**：

- `image: postgres:16-alpine` ❌ 无 digest
- `image: edoburu/pgbouncer:1.23.0` ❌ 无 digest
- `image: otel/opentelemetry-collector-contrib:0.119.0` ❌ 无 digest
- 业务镜像名（`backtest-platform/frontend-api` 等）不含版本 tag

### 分析

- Dockerfile 层安全基线良好：digest pin 为主流（仅 engine-go builder 使用 placeholder）、非 root 用户、HEALTHCHECK 完备
- distroless PoC 已验证但未被 docker-compose 引用（无实际使用）
- **K8s manifest 安全基线薄弱**：所有基础镜像（postgres、pgbouncer、otel-collector）均使用可变 tag，无 digest pin
- K8s securityContext 配置良好：`runAsNonRoot: true`、`readOnlyRootFilesystem: true`、`capabilities.drop: ALL`

### 结论

**镜像层良好，K8s manifest 层薄弱**。Dockerfile 的 digest pin 覆盖率达 80%，但 engine-go builder 的 placeholder digest 需要修复。K8s manifest 中所有基础镜像缺少 digest pin 是明显的安全缺口。

---

## Q6: Go Engine 扩缩容能力

### 证据

**无状态确认**：

- `router.go:77` 注释：**"无状态设计（priceData 由调用方传入）便于水平扩展"**
- `router.go:119` 注释：**"priceData 由前端传入而非 Go 服务读取文件，保持无状态设计"**
- `backtest.go`：所有计算数据通过请求体传入（`BacktestRequest.PriceData`、`CPIData`、`ExchangeRates`）
- `main.go`：无本地状态存储，无 session 管理，无 goroutine 本地缓存

**数据库连接**：

- Go engine 没有直接连接 PostgreSQL，`go.mod` 中无 pgx/pq 依赖
- 数据通过 API 层的 HTTP 调用传递（`BacktestRequest.PriceData`）

**部署配置**：

- k8s：`replicas: 2`、PDB `minAvailable:1`
- docker-compose：单副本
- **无 HPA**（仅 API 服务有 HPA）
- 资源限制：requests: 512Mi/1CPU, limits: 2Gi/2CPU

**健康检查**：

- startupProbe: 60s 窗口（30 × 2s）
- livenessProbe: 45s 窗口 + 10s 初始延迟
- readinessProbe: 30s 窗口 + 5s 初始延迟

### 分析

Go engine 是无状态计算服务，理论上可以任意扩展。当前配置为 2 副本 + PDB，保障滚动更新不中断。但由于：

1. **CPU 密集型**：回测/蒙特卡洛/优化均消耗大量 CPU，多副本并行计算可线性增加吞吐
2. **无 HPA**：无法根据 CPU 负载自动扩缩容，峰值流量时只能靠 2 副本硬扛
3. **计算请求排队**：请求直接 POST，无任务队列，副本数不足时请求排队等待
4. **无限流**：router.go 配置了全局 0.5 rps/burst 30 限流，但单副本限流不共享

### 结论

**架构上可扩展，但缺乏自动化扩缩容机制**。无状态设计正确，2 副本 + PDB 提供基本高可用。但缺少 HPA 导致无法应对负载波动。建议：

- 为 engine-go 添加 HPA（基于 CPU 利用率）
- 考虑引入任务队列（BullMQ）处理突发回测请求
- 考虑多副本限流共享（Redis 集中计数器）
