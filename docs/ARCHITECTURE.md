# 架构详解 (Architecture)

> 本文档详细描述回测平台的服务拓扑、降级链、数据流和关键设计决策。

---

## 1. 服务拓扑

```mermaid
flowchart TB
    subgraph Client["客户端"]
        UI["浏览器<br/>React SPA"]
    end

    subgraph APILayer["API 层 (端口 5001)"]
        APP["Express App<br/>packages/backend/src/app.ts"]
        ROUTES["路由层<br/>packages/backend/src/routes/"]
        APP_LAYER["应用层<br/>packages/backend/src/application/<br/>(billing/org/auth 子目录)"]
        INFRA["基础设施层<br/>packages/backend/src/infrastructure/<br/>(dataFacade/dataQuery/dataCache/dataFetch)"]
        DOMAIN["领域层<br/>packages/backend/src/domain/<br/>(aggregates/run.ts + events/)"]
    end

    subgraph EngineLayer["引擎层"]
        GO_ENG["Go 引擎 (唯一)<br/>engine-go/ :5004<br/>Gin + gonum"]
    end

    subgraph DataLayer["数据层"]
        GO_DATA["Go 数据服务<br/>data-fetcher/ :5003<br/>Gin + pgx"]
    end

    subgraph Storage["存储"]
        PG["PostgreSQL (主)<br/>pg / pgx"]
        GO_DATA_FALLBACK["Go 数据服务 (备)<br/>实时获取缺失 ticker"]
    end

    UI -->|"HTTP /api/*"| APP
    APP --> ROUTES --> APP_LAYER
    APP_LAYER --> DOMAIN
    APP_LAYER --> INFRA
    INFRA -->|"callGoEngine()"| GO_ENG
    INFRA -->|"失败 503 (ADR-031)"| GO_ENG
    INFRA -->|"callGoDataService()"| GO_DATA
    INFRA -->|"callGoDataService()"| GO_DATA_FALLBACK
    GO_DATA --> PG
```

---

## 2. 降级链详解

### 2.1 引擎降级（Go Fail-Closed，ADR-031）

**决策**：Go 引擎不可用时直接返回 503 + Retry-After，不再静默降级到 Node/Rust 备用引擎。

**触发条件**（见 [packages/backend/src/routes/backtestRoutes.ts](../packages/backend/src/routes/backtestRoutes.ts) 的引擎调用逻辑）：

- 连接拒绝（ECONNREFUSED）
- HTTP 状态码非 2xx
- 5 秒超时（`timeoutMs = 5000`）
- 熔断器 Open 状态（见 [ADR-016](adr/ADR-016-熔断器策略.md)）

**处理逻辑**：

- `callEngineStrict()` → 失败 → `EngineUnavailableError` → HTTP 503 + `Retry-After: 30`
- 熔断器（opossum）：50% 错误阈值，30s 半开重置，最小 5 请求窗口
- 响应体格式：`{ success: false, error: { type, title, status, code, detail, retryAfterSeconds } }`

### 2.2 数据降级（PostgreSQL → Go 数据服务，ADR-007）

**降级链**：PostgreSQL（主）→ Go 数据服务（备，缺失 ticker 实时抓取）

**触发条件**（见 [packages/backend/src/routes/dataRoutes.ts](../packages/backend/src/routes/dataRoutes.ts) 的 `callService`）：

- 连接拒绝（ECONNREFUSED）
- HTTP 状态码非 2xx
- 30 秒超时（`timeoutMs = 30000`）
- PostgreSQL 熔断器 Open 状态（见 [ADR-016](adr/ADR-016-熔断器策略.md)）

**降级逻辑**：

- PostgreSQL 不可用 → 返回 503 + Retry-After（fail-closed，不再降级到 JSON 文件）
- 查询缺失 ticker → Go 数据服务实时获取（baostock / HTTP API）
- 搜索：PostgreSQL 全文搜索失败 → 降级到 ticker 前缀匹配扫描（不使用 Python）

---

## 3. 数据流

### 3.1 组合回测完整流程

```
1. 用户在前端设置参数 + 组合 → 点击"回测"
2. 前端 POST /api/backtest/portfolio { portfolios, parameters }
3. 后端 backtestRoutes.ts:
   a. 收集所有 ticker（组合资产 + 基准）
   b. fetchHistoryData() 获取价格数据
      - 优先 PostgreSQL 查询（pg Pool）
      - Go 数据服务实时获取（缺失 ticker，ADR-007）
   c. 加载 CPI 数据（按 baseCurrency 选择 cn/us）
   d. 加载汇率数据（baseCurrency === 'cny' 时）
   e. callGoEngine('/api/engine/backtest', goBody)
      - 失败返回 503 + Retry-After（fail-closed，ADR-031）
   f. 返回 { success, data, warnings? }
4. 前端渲染结果（增长图/回撤/统计/年度收益/月度收益/相关性）
```

### 3.2 蒙特卡洛模拟流程

```
1. 前端 POST /api/backtest/monte-carlo { portfolio|portfolios, parameters, mcParams }
2. 后端:
   a. 获取价格数据
    b. 调用 Go 引擎 /api/engine/monte-carlo
    c. Go 引擎不可用时返回 503 + Retry-After（fail-closed，ADR-031）
3. 返回百分位路径、成功概率、分布统计
```

---

## 4. 端口分配

| 服务              | 端口            | 配置位置                                                                   |
| ----------------- | --------------- | -------------------------------------------------------------------------- |
| 前端 Vite         | 5176            | vite.config.ts                                                             |
| 后端 API          | 5001            | `PORT` 环境变量 / server.ts                                                |
| Go 引擎           | 5004            | engine-go/ (环境变量)                                                      |
| Go 数据服务       | 5003            | data-service/ (环境变量)                                                   |
| PostgreSQL (主)   | 5432            | DATABASE_URL 环境变量                                                      |
| PostgreSQL 读副本 | 5432            | _需重新设计_（原 k8s/postgres-replica.yaml 已删除，PG16 流复制语法待重写） |
| PgBouncer         | 5432            | k8s/pgbouncer.yaml                                                         |
| Redis             | 6379            | docker-compose.yml                                                         |
| OTel SaaS（可选） | 443 (OTLP/HTTP) | `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量（ADR-044，取代自建 Collector）      |

---

## 5. 入口文件职责

后端有 2 个入口文件，职责不同：

| 文件                                           | 用途              | 说明                                               |
| ---------------------------------------------- | ----------------- | -------------------------------------------------- |
| [app.ts](../packages/backend/src/app.ts)       | Express 应用配置  | 中间件、路由挂载、错误处理。被 server.ts 引用      |
| [server.ts](../packages/backend/src/server.ts) | 本地开发/生产入口 | `app.listen()` 启动 HTTP 服务，处理 SIGTERM/SIGINT |

---

## 6. 关键模块

### 6.1 后端路由层 (`packages/backend/src/routes/`)

| 文件                         | 路径前缀                                                         | 职责                                                          |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `healthRoutes.ts`            | `/api`                                                           | 健康检查、监控指标（已合并 debugRoutes）                      |
| `dataRoutes.ts`              | `/api/v1/data`                                                   | 历史数据、搜索、CPI                                           |
| `dataManageRoutes.ts`        | `/api/v1/data/manage`                                            | 数据管理（批量更新等）                                        |
| `backtestRoutes.ts`          | `/api/v1/backtest`                                               | 回测/分析/蒙特卡洛/优化/有效前沿                              |
| `backtestOptimizerRoutes.ts` | `/api/v1/backtest-optimizer`                                     | 回测优化器（有效前沿、Markowitz 优化）                        |
| `tacticalRoutes.ts`          | `/api/v1/tactical`                                               | 战术分配（信号驱动动态权重回测）                              |
| `tacticalGridRoutes.ts`      | `/api/v1/tactical-grid`                                          | 战术网格搜索（参数空间遍历优化）                              |
| `signalRoutes.ts`            | `/api/v1/signal`                                                 | 信号分析（单/双/多信号）                                      |
| `analysisRoutes.ts`          | `/api/v1/{pca,letf,goal-optimizer,factor-regression,calculator}` | 分析类薄路由合并（PCA / LETF / 目标优化 / 因子回归 / 计算器） |
| `authRoutes.ts`              | `/api/v1/auth`                                                   | 认证鉴权（登录、令牌刷新、登出、身份查询）                    |
| `apiKeyRoutes.ts`            | `/api/v1/keys`                                                   | 按组织 API Key 管理（ADR-033）                                |
| `portfolioRoutes.ts`         | `/api/v1/portfolios`                                             | 租户作用域组合持久化（ADR-034）                               |
| `configRoutes.ts`            | `/api/v1/configs`                                                | 租户作用域命名配置持久化（ADR-034）                           |
| `runRoutes.ts`               | `/api/v1/runs`                                                   | 租户作用域回测历史持久化（ADR-034）                           |
| `orgRoutes.ts`               | `/api/v1/orgs`                                                   | 组织与成员管理、邀请（ADR-035）                               |
| `billingRoutes.ts`           | `/api/v1/billing`                                                | Stripe 计费（订阅、Checkout、Portal，ADR-036）                |
| `jobRoutes.ts`               | `/api/v1`                                                        | 异步任务状态查询（ADR-019 所有权隔离）                        |
| `adminRoutes.ts`             | `/api/v1/admin`                                                  | 管理后台接口                                                  |

> 注：认证授权已实现 JWT + RBAC 模型（见 [ADR-017](adr/ADR-017-认证授权模型.md)），保留 `x-api-key` 兼容模式（analyst 角色）。

### 6.2 后端应用层 (`packages/backend/src/application/`)

> 注：原 `services/` 目录已消除（ADR-044 相关重构），12 个文件按职责迁入 `application/` 与 `infrastructure/`，消除跨层依赖违规。

| 子目录 / 文件                             | 职责                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `application/billing/`                    | 计费用例：`billingService.ts` + `usageService.ts` + `planLimitsService.ts` |
| `application/org/`                        | 组织用例：`membershipService.ts` + `invitationService.ts`                  |
| `application/auth/`                       | 认证用例：`userService.ts` + `loginLockout.ts`                             |
| `application/analysis-orchestrator.ts`    | 分析编排（跨层依赖修复）                                                   |
| `application/signal-orchestrator.ts`      | 信号编排                                                                   |
| `application/backtest-service.ts`         | 回测用例（通过 Run 聚合根驱动状态机）                                      |
| `application/backtestCompletedHandler.ts` | BacktestCompleted 事件 handler                                             |
| `application/runCompletedHandler.ts`      | RunCompleted 事件 handler（Run 聚合根落地，ADR-013）                       |

### 6.3 后端基础设施层 (`packages/backend/src/infrastructure/`)

| 文件                                     | 职责                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| `dataFacade.ts`                          | 数据门面（PostgreSQL + Go 数据服务降级，透传 `degraded` 标记） |
| `dataQuery.ts`                           | 数据查询（含 `goServiceSemaphore=10` 并发限制，ADR-027）       |
| `dataCache.ts`                           | 数据缓存                                                       |
| `dataFetch.ts`                           | 数据抓取                                                       |
| `cpiLoader.ts`                           | CPI 数据加载                                                   |
| `apiKeyVerifier.ts`                      | API Key 校验                                                   |
| `mailService.ts`                         | 邮件服务（nodemailer 9.x）                                     |
| `outboxWriter.ts` / `outboxPublisher.ts` | Outbox 表写入与发布（ADR-014）                                 |
| `redisClient.ts` / `redisHealth.ts`      | Redis 客户端与健康检查（ADR-018）                              |

### 6.4 后端领域层 (`packages/backend/src/domain/`)

| 子目录 / 文件                    | 职责                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `domain/aggregates/run.ts`       | Run 聚合根（状态机 queued → running → completed/failed/cancelled，ADR-013 Phase 2） |
| `domain/aggregates/portfolio.ts` | Portfolio 聚合根（fromDTO + validateWeightSum）                                     |
| `domain/events/`                 | 领域事件（RunStarted/RunCompleted/RunFailed/RunCancelled，ADR-013 Phase 3）         |
| `domain/services/`               | 领域服务（grid-search / optimizer-domain）                                          |
| `domain/value-objects/`          | 值对象（ticker / weight，ADR-013 Phase 1）                                          |

> 注：Rust 引擎 `engine-rs/` 已根据 ADR-031 删除，Node 引擎已随架构清理全部迁移到 Go 引擎。Go 引擎 (`engine-go`) 是 backtest / 蒙特卡洛 / 优化器 / 有效前沿 / tactical / signal / pca / letf 的**唯一计算引擎**，不可用时返回 503 + Retry-After（fail-closed，无 Node 降级）。

### 6.5 Go 引擎 (`engine-go/`)

| 模块     | 职责                                             |
| -------- | ------------------------------------------------ |
| 回测核心 | 组合回测、统计指标、SWR/PWR（gonum/stat）        |
| 蒙特卡洛 | 区块自举采样（gonum/stat/dist + sync.Pool 并行） |
| 优化器   | Markowitz 优化、有效前沿（gonum/optimize）       |

> **已退役 (ADR-031)**：Rust 引擎 `engine-rs/` 目录已删除。`engine-go` 是唯一计算引擎，不可用时返回 503。 |

### 6.6 前端页面 (`packages/frontend/src/pages/`)

| 页面                             | 路由                       | 功能             |
| -------------------------------- | -------------------------- | ---------------- |
| `BacktestPage.tsx`               | `/`                        | 组合回测（主页） |
| `AnalysisPage.tsx`               | `/analysis`                | 资产分析         |
| `MonteCarloPage.tsx`             | `/monte-carlo`             | 蒙特卡洛模拟     |
| `OptimizerPage.tsx`              | `/optimizer`               | 组合优化         |
| `EfficientFrontierPage.tsx`      | `/efficient-frontier`      | 有效前沿         |
| `RebalancingSensitivityPage.tsx` | `/rebalancing-sensitivity` | 调仓敏感性       |
| `LumpSumVsDCAPage.tsx`           | `/lumpsum-vs-dca`          | 一次性 vs 定投   |
| `FactorRegressionPage.tsx`       | `/factor-regression`       | 因子回归         |
| `CalculatorsPage.tsx`            | `/calculators`             | 计算器           |
| `DataEnginePage.tsx`             | `/data-engine`             | 数据引擎         |
| `AboutPage.tsx`                  | `/about`                   | 关于             |

---

## 7. 共享类型 (`shared/`)

[shared/types/index.ts](../packages/shared/types/index.ts) 定义前后端共享的类型，包括：

- `Portfolio` / `Asset` / `RebalanceFrequency` - 组合定义
- `BacktestParameters` / `CashflowLeg` / `OneTimeCashflow` - 回测参数
- `Statistics` - 统计指标（60+ 字段）
- `PortfolioResult` / `BacktestResult` - 回测结果
- `MonteCarloParameters` / `MonteCarloResult` - 蒙特卡洛
- `OptimizationResult` / `EfficientFrontierResult` - 优化器
- `CHART_COLORS` - 图表颜色常量

---

## 8. 数据目录 (`data/`)

```
data/
├── market/tickers/    # 标的行情 JSON（仅用于 npm run import:tickers 导入，非运行时降级）
└── cache/             # 运行时缓存 (gitignore)
```

---

## 9. 设计决策

### 9.1 为什么用 Go + TypeScript 而非单语言？

- **Go**：计算密集型（回测/蒙特卡洛/优化）+ 数据服务（并发 HTTP + baostock），goroutine 并行模型适合 I/O+CPU 混合场景
- **TypeScript**：前后端共享类型，前端 React 生态成熟

### 9.2 Go 引擎 fail-closed 策略

- Go 引擎是唯一计算引擎（ADR-008/031），不可用时返回 503 + Retry-After
- 不再保留备用引擎（Rust 已退役；Node 引擎已全部迁移到 Go，见 ADR-031）
- 降级时响应中包含 `degraded: true`

### 9.3 数据存储演进：JSON → SQLite → PostgreSQL

- 早期采用 JSON 文件存储（见 ADR-002，已被 ADR-006 取代）
- 2026-06 初，数据读取路径迁移至 SQLite（better-sqlite3 + WAL 模式，见 ADR-006）
- 2026-06 中，从 SQLite 迁移至 PostgreSQL（pgx + pg 驱动，见 ADR-007）
  - 解除多实例水平扩展阻塞（SQLite 单文件无法跨 Pod 共享）
  - 获得连接池、全文搜索（tsvector + GIN）、流复制等企业级能力
- `packages/backend/src/db/` 实现版本化 schema 迁移和 JSON→PostgreSQL 导入
- JSON 文件仅用于 `npm run import:tickers` 导入，非运行时降级路径（ADR-031 fail-closed）
- 迁移决策详见 [ADR-006](adr/ADR-006-SQLite迁移决策.md)、[ADR-007](adr/ADR-007-PostgreSQL迁移决策.md)

### 9.4 已知局限性

- **Go 数据服务信号量=10**：`packages/backend/src/infrastructure/dataQuery.ts` 中 `goServiceSemaphore` 限制对 data-fetcher 并发（默认 10，ADR-027）
- **x-api-key 兼容风险**：静态 Key 无法按用户撤销（ADR-017）
- **Redis 依赖**：会话/限流/幂等；fail-closed 或内存回退

### 9.5 ADR 索引

> 完整索引见 [adr/README.md](adr/README.md)。编号不可变，gaps 表示被取代/删除/合并的决策。

| ADR                                                             | 主题                                       | 状态   |
| --------------------------------------------------------------- | ------------------------------------------ | ------ |
| [ADR-004](adr/ADR-004-Express框架选型.md)                       | Express 框架选型                           | 已接受 |
| [ADR-005](adr/ADR-005-Pino日志选型.md)                          | Pino 日志选型                              | 已接受 |
| [ADR-007](adr/ADR-007-PostgreSQL迁移决策.md)                    | PostgreSQL 迁移                            | 已接受 |
| [ADR-008](adr/ADR-008-语言精简决策.md)                          | Go+TypeScript 精简                         | 已接受 |
| [ADR-009](adr/ADR-009-请求体校验库选型.md)                      | Zod 校验库                                 | 已接受 |
| [ADR-011](adr/ADR-011-长任务异步化方案.md)                      | BullMQ 异步任务                            | 已接受 |
| [ADR-012](adr/ADR-012-SBOM与制品签名方案.md)                    | 供应链安全（SBOM+SLSA+cosign）             | 已接受 |
| [ADR-013](adr/ADR-013-领域模型重构策略.md)                      | DDD 渐进式重构                             | 已接受 |
| [ADR-014](adr/ADR-014-事件溯源Outbox方案.md)                    | 事件溯源/Outbox                            | 已接受 |
| [ADR-015](adr/ADR-015-可观测性技术选型.md)                      | 可观测性技术选型                           | 已接受 |
| [ADR-016](adr/ADR-016-熔断器策略.md)                            | 熔断器策略                                 | 已接受 |
| [ADR-017](adr/ADR-017-认证授权模型.md)                          | 认证授权模型                               | 已接受 |
| [ADR-018](adr/ADR-018-Redis选型.md)                             | Redis 选型                                 | 已接受 |
| [ADR-019](adr/ADR-019-异步任务越权防护与所有权模型.md)          | Job 所有权                                 | 已接受 |
| [ADR-020](adr/ADR-020-限流fail-closed分级策略.md)               | 限流 fail-closed 分级（含全局）            | 已接受 |
| [ADR-023](adr/ADR-023-数据隐私分类与删除权实现.md)              | GDPR                                       | 已接受 |
| [ADR-024](adr/ADR-024-Outbox强一致与消费者幂等.md)              | Outbox+幂等+重试边界                       | 已接受 |
| [ADR-026](adr/ADR-026-开发环境认证旁路安全边界.md)              | DEV_SKIP_AUTH                              | 已接受 |
| [ADR-027](adr/ADR-027-100x容量拐点与缓解.md)                    | 100x 容量                                  | 已接受 |
| [ADR-031](adr/ADR-031-单引擎fail-closed降级.md)                 | 单引擎 fail-closed 降级                    | 已接受 |
| [ADR-032](adr/ADR-032-多租户RLS隔离模型.md)                     | 多租户 RLS 隔离                            | 已接受 |
| [ADR-033](adr/ADR-033-按组织API密钥.md)                         | 按组织 API 密钥                            | 已接受 |
| [ADR-034](adr/ADR-034-服务端持久化与前端认证.md)                | 服务端持久化 + 前端认证                    | 已接受 |
| [ADR-035](adr/ADR-035-自助注册与组织邀请.md)                    | 自助注册与组织邀请                         | 已接受 |
| [ADR-036](adr/ADR-036-Stripe计费.md)                            | Stripe 计费                                | 已接受 |
| [ADR-037](adr/ADR-037-配额计量与公平调度.md)                    | 配额计量与公平调度                         | 已接受 |
| [ADR-038](adr/ADR-038-ci-tiering-and-dependency-enforcement.md) | CI 分层与依赖方向强制                      | 已接受 |
| [ADR-042](adr/ADR-042-api-packages-consolidation.md)            | API 包合并                                 | 已接受 |
| [ADR-043](adr/ADR-043-baostock-provider双通路职责分离.md)       | baostock 双通路职责分离                    | 已接受 |
| [ADR-044](adr/ADR-044-otel-saas-replacement.md)                 | OTel SaaS 替换（go-shared + 环境变量切换） | 已接受 |

---

## 10. 可观测性栈

详见 [ADR-015](adr/ADR-015-可观测性技术选型.md)。

| 支柱    | Node.js                           | Go                       |
| ------- | --------------------------------- | ------------------------ |
| 日志    | pino（结构化 JSON）               | slog（结构化 JSON）      |
| 指标    | prom-client（Prometheus 格式）    | prometheus/client_golang |
| 追踪    | @opentelemetry/sdk-node           | otelgin + OTLP（已接线） |
| DB 追踪 | @opentelemetry/instrumentation-pg | pgx OTel 集成            |

**Trace 导出架构**（ADR-044）：各服务 → OTLP HTTP → SaaS 后端（Honeycomb / Datadog / Axiom，通过 `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量切换）。原自建 OTel Collector 已移除，指标仍走 Prometheus 直连。Go 服务的 OTel 初始化代码已收口到 `packages/go-shared/observability/otel.go`。

---

## 11. 熔断器策略

详见 [ADR-016](adr/ADR-016-熔断器策略.md)。

| 服务         | 熔断器                  | 保护目标                                             |
| ------------ | ----------------------- | ---------------------------------------------------- |
| Go 引擎      | opossum（Node.js 侧）   | 引擎 fail-closed（Go → 503）                         |
| PostgreSQL   | opossum（Node.js 侧）   | 数据层降级：PG → Go 数据服务（缺失 ticker 实时抓取） |
| BaoStock API | sony/gobreaker（Go 侧） | 数据获取降级                                         |

**熔断器配置**：50% 失败率触发 Open，10s 后 HalfOpen 探测。PostgreSQL 熔断器替代原有 `dbAvailable` 布尔标记，提供自动恢复能力。

---

## 12. 认证授权模型

详见 [ADR-017](adr/ADR-017-认证授权模型.md)。

| 维度          | 实现                                              |
| ------------- | ------------------------------------------------- |
| 认证          | JWT（jose 库，RS256 算法）                        |
| 兼容模式      | x-api-key → analyst 角色                          |
| 授权          | RBAC 三角色（ADMIN / ANALYST / READONLY）× 七权限 |
| Access Token  | 15 分钟有效期                                     |
| Refresh Token | 7 天有效期 + 轮换机制，存储于 Redis               |
| 幂等性        | Idempotency-Key 中间件，Redis 存储                |

---

## 13. 100x 流量扩展（ADR-027）

> 规范路径 `docs/architecture.md` 在 Windows 上与本文档为同一文件（大小写不敏感）。

| 顺序 | 瓶颈                    | 观测指标                     | 缓解                               |
| ---- | ----------------------- | ---------------------------- | ---------------------------------- |
| 1    | Compute / Node 事件循环 | `node_eventloop_lag_seconds` | BullMQ、HPA、Go 引擎扩展           |
| 2    | PostgreSQL 连接池       | `pg_pool_waiting_count`      | PgBouncer、读副本、`getReadPool()` |
| 3    | 数据服务 + 外部 API     | `data_service_semaphore_*`   | 缓存、gobreaker                    |
| 4    | Redis                   | 503 限流                     | Sentinel/Cluster                   |

详见 [`capacity-planning.md`](./capacity-planning.md)。
