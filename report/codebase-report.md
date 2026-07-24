# 回测平台 (Backtest Platform) — 完整代码库分析报告

> 生成日期: 2026-07-24 | 用于 AI 智能体审核

---

## 1. 项目概览

| 属性 | 值 |
|---|---|
| **名称** | `backtest-platform` |
| **版本** | 0.2.0 |
| **许可证** | MIT |
| **模块系统** | ESM (pnpm monorepo) |
| **包管理器** | pnpm 11.5.3 |
| **语言** | TypeScript (47%) + Go (8.5%) + JSON/YAML/Markdown 等 |
| **总源文件** | 1,036 个 (不含 .exe) |
| **总源代码行数** | 213,238 行 |
| **总测试文件** | 182 个 (TS) + 25 个 (Go) = 207 个 |
| **总测试行数** | 39,097 行 (TS) |

---

## 2. LOC 分布

### 2.1 按文件扩展名

| 扩展名 | 文件数 | 行数 | 占比 |
|---|---|---|---|
| `.ts` | 453 | 69,939 | 32.8% |
| `.json` | 32 | 50,760 | 23.8% |
| `.tsx` | 211 | 30,333 | 14.2% |
| `.yaml/.yml` | 37 | 23,640 | 11.1% |
| `.go` | 108 | 18,182 | 8.5% |
| `.md` | 56 | 8,712 | 4.1% |
| `.css` | 18 | 2,771 | 1.3% |
| `.sql` | 31 | 716 | 0.3% |
| 其他 | 120 | 8,685 | 4.1% |

### 2.2 按包/目录 (仅源代码)

| 目录 | 文件数 | 行数 | 占比 |
|---|---|---|---|
| `packages/frontend/` | 320 | 48,337 | 22.7% |
| `tests/` | 209 | 42,052 | 19.7% |
| `packages/backend/` | 146 | 18,014 | 8.4% |
| `engine-go/` | 73 | 11,835 | 5.6% |
| `data-fetcher/` | 43 | 6,065 | 2.8% |
| `docs/` | 52 | 9,501 | 4.5% |
| `packages/shared/` | 15 | 1,082 | 0.5% |
| `packages/go-shared/` | 8 | 490 | 0.2% |
| `migrations/` | 30 | 696 | 0.3% |
| `k8s/` | 22 | 1,437 | 0.7% |
| 根目录配置 | 62 | 16,278 | 7.6% |
| 其他 | 96 | 51,471 | 27.0% |

### 2.3 最大源文件 Top 10

| 文件 | 行数 | 说明 |
|---|---|---|
| `tests/unit/middleware/jwt-auth.hs256.test.ts` | 1,051 | JWT 认证单元测试 |
| `tests/unit/routes/analysisRoutes.test.ts` | 871 | 分析路由测试 |
| `tests/unit/services/data-service.test.ts` | 734 | 数据服务测试 |
| `.github/workflows/ci.yml` | 732 | CI 流水线 |
| `tests/unit/routes/auth-routes.test.ts` | 715 | 认证路由测试 |
| `packages/frontend/src/pages/optimizer/OptimizerResults.tsx` | ~671 | 优化器结果页 |
| `packages/frontend/src/pages/optimizer/OptimizerUtils.ts` | ~662 | 优化器工具函数 |
| `packages/backend/src/routes/analysisRoutes.ts` | ~587 | 分析路由 |
| `packages/backend/src/application/backtest-service.ts` | ~574 | 回测应用服务 |
| `packages/backend/src/utils/engineClient.ts` | ~158 | 引擎调用客户端 |

---

## 3. 技术栈全景

### 3.1 前端 (Frontend)

| 技术 | 版本 | 用途 |
|---|---|---|
| React 18 | ^18.3.1 | UI 框架 |
| TypeScript | ~5.8.3 | 类型安全 |
| Vite 6 | ^6.3.5 | 构建工具 + 开发服务器 |
| Tailwind CSS 3 | ^3.4.17 | CSS 原子化框架 |
| Zustand 5 | ^5.0.3 | 状态管理 |
| Recharts | ^2.15.0 | 图表库 |
| React Router 7 | ^7.3.0 | 路由 |
| Radix UI | 多组件 | 无头 UI 原语 |
| i18next | ^26.3.1 | 国际化 (中/英) |
| Lucide React | ^0.511.0 | 图标 |
| CVA + clsx | — | 样式组合 |
| @fontsource/geist | — | 字体 |

### 3.2 后端 API (Backend)

| 技术 | 版本 | 用途 |
|---|---|---|
| Express 4 | ^4.22.2 | HTTP 框架 |
| TypeScript ESM | tsx | 运行时 |
| Zod 4 | ^4.4.3 | 运行时校验 |
| Pino | ^9.6.0 | 日志 |
| OpenTelemetry | — | 分布式追踪 |
| Prometheus (prom-client) | ^15.1.0 | 指标 |
| Helmet | ^8.0.0 | 安全头 |
| CORS | ^2.8.5 | 跨域 |
| Compression | ^1.8.0 | 压缩 |
| pg | ^8.14.0 | PostgreSQL 驱动 |
| ioredis | ^5.6.0 | Redis 客户端 |
| BullMQ | ^5.46.0 | 任务队列 |
| jose | ^5.10.0 | JWT |
| argon2 | ^0.41.1 | 密码哈希 |
| opossum | ^8.5.0 | 熔断器 |
| express-rate-limit | ^7.5.0 | 限流 |
| stripe | ^17.7.0 | 支付 |
| nodemailer | ^9.0.1 | 邮件 |

### 3.3 Go 引擎 (engine-go)

| 技术 | 版本 | 用途 |
|---|---|---|
| Go | 1.26.4 | 语言 |
| Gin | v1.12.0 | HTTP 框架 |
| Gonum | v0.17.0 | 数值计算 |
| otelgin | v0.60.0 | OTel 集成 |
| go-shared (内部) | — | 共享库 (HTTP, 日志, OTel) |

### 3.4 Go 数据服务 (data-fetcher)

| 技术 | 版本 | 用途 |
|---|---|---|
| Go | 1.26.4 | 语言 |
| Gin | v1.12.0 | HTTP 框架 |
| pgx/v5 | v5.10.0 | PostgreSQL 驱动 |
| gobreaker | v1.0.0 | 熔断器 |
| limiter/v3 | v3.11.2 | 限流 |
| otelgin | — | OTel 集成 |

### 3.5 数据层

| 技术 | 版本 | 用途 |
|---|---|---|
| PostgreSQL | 16-alpine | 主数据库 |
| Redis | 7-alpine | 缓存/会话/队列 |

### 3.6 测试框架

| 技术 | 版本 | 用途 |
|---|---|---|
| Vitest | ^2.1.0 | 单元/集成/合约/混沌/属性测试 |
| Playwright | ^1.61.0 | E2E 浏览器测试 |
| fast-check | ^4.8.0 | 基于属性的测试 |
| Testcontainers | ^12.0.3 | 容器化集成测试 |
| Testing Library | ^16.3.2 | React 组件测试 |
| happy-dom | ^15.11.7 | 浏览器环境模拟 |
| nyc | ^18.0.0 | E2E 覆盖率 |

### 3.7 DevOps

| 技术 | 用途 |
|---|---|
| ESLint 9 | 代码检查 |
| Prettier | 格式化 |
| Husky + lint-staged | Git 钩子 |
| dependency-cruiser | 依赖分析 |
| knip | 死代码检测 |
| jscpd | 重复代码检测 |
| Docker Compose | 本地开发 |
| Kubernetes | 生产部署 |
| GitHub Actions | CI/CD |
| Gitleaks | 密钥扫描 |

---

## 4. 架构全景

### 4.1 服务拓扑

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React 18 + Vite 6) ── :15173 (dev) / :80 (prod)              │
│  packages/frontend/                                                      │
│  Zustand 状态管理 + Recharts 图表 + React Router 7 路由                  │
│  中英双语 i18n + Tailwind CSS 3 + Radix UI 组件库                        │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │ HTTP /api/* (Vite proxy → :15001)
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND API (Express 4 + TypeScript ESM) ── :15001 (dev) / :5001 (ctr) │
│  packages/backend/                                                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────────────┐   │
│  │ routes/ (20) │ application/ │ domain/ (DDD)│ infrastructure/ (12) │   │
│  │ middleware/  │ schemas/ (14)│ repositories│ queues/ (BullMQ)     │   │
│  │ (17)         │              │ (8)          │                      │   │
│  └──────────────┴──────────────┴──────────────┴──────────────────────┘   │
│  JWT + RBAC (3角色×7权限) + API Key + 多租户 RLS + 熔断 + 限流         │
│  Stripe 计费 + OTel 追踪 + Prometheus 指标 + BullMQ 队列                 │
│  Outbox 模式 (最终一致性) + 领域事件                                     │
└──────┬──────────────────┬───────────────────────┬────────────────────────┘
       │ HTTP              │ HTTP                  │ SQL + Redis
       ▼                   ▼                       ▼
┌──────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐
│ Go Engine    │ │ Go Data Service  │ │ PostgreSQL 16 + Redis 7      │
│ :15004/:5004 │ │ :15003/:5003     │ │                              │
│ Gin + gonum  │ │ Gin + pgx        │ │ tickers, prices, cpi_data,  │
│              │ │                  │ │ users, orgs, memberships,    │
│ 14 个计算端点 │ │ 5 个数据端点     │ │ api_keys, portfolios,        │
│              │ │ + 4 个 baostock  │ │ backtest_runs, outbox,       │
│ fail-closed  │ │ 数据源降级链:     │ │ stripe_customers,            │
│ (ADR-031)    │ │ yfinance→finnhub │ │ subscriptions, usage_events  │
│              │ │ →twelvedata→akshare│ │                              │
└──────────────┘ └──────────────────┘ └──────────────────────────────┘
```

### 4.2 端口映射

| 服务 | 开发端口 | 容器端口 | Docker 服务名 |
|---|---|---|---|
| Express API | 15001 | 5001 | `api` |
| Go Engine | 15004 | 5004 | `engine-go` |
| Go Data Service | 15003 | 5003 | `data-fetcher` |
| Vite Dev Server | 15173 | — | — |
| PostgreSQL | 5432/15442 | 5432 | `postgres` |
| Redis | 6379/16381 | 6379 | `redis` |
| Nginx (Frontend prod) | — | 80 | `frontend` |

### 4.3 数据流: 回测请求

```
用户点击 "Run Backtest"
  → frontend/src/store/executionSlice.ts: runBacktest()
    → apiFetch POST /api/v1/backtest/portfolio
      → middleware 链: computeMiddleware(Permission.BACKTEST_RUN)
        → optionalJwtAuth → assignGuestAnalyst → resolveTenant
        → requirePermission → enforceQuota → auditLog
      → backtestRoutes.ts: runPortfolioBacktest()
        → application/backtest-service.ts
          → preparePortfolioBacktest() — 领域校验
          → fetchPriceDataWithRange() — 数据检索
            → dataFacade → dataQuery (PostgreSQL 熔断器)
            → Go data-fetcher 回退 (缺失 ticker)
          → loadMacroData() — CPI/汇率
          → callEngineStrict() → HTTP POST /api/engine/backtest
            → opossum 熔断器 → Go engine
              → engine.RunBacktest()
                → computeGrowthCurve() → CalcDrawdownCurve()
                → computeStatistics()
          → compressBacktestResultForSync() — LRU 缓存
          → writeEventInTransaction() — outbox 事务
          → eventDispatcher.dispatch() → BacktestCompletedHandler
```

### 4.4 数据流: 认证

```
用户登录
  → POST /api/v1/auth/login/password
    → isLockedOut() (Redis)
    → verifyUser() — argon2id 密码验证 (PostgreSQL)
    → recordFailure() / clearFailures() — 登录锁定
    → resolveDefaultOrg() — 多租户上下文
    → generateToken() — JWT 访问令牌 (15min TTL)
    → generateRefreshToken() — 刷新令牌 (7d TTL, Redis)
    → 返回 { accessToken, refreshToken, role, userId, org }
```

### 4.5 数据流: 数据检索

```
GET /api/v1/data/history?tickers=SPY,VTI&startDate=...&endDate=...
  → dataRoutes handler
    → fetchHistoryData() in dataFacade.ts
      → 1. 检查文件缓存 (dataCache.ts)
      → 2. 查询 PostgreSQL via dataQuery.ts (opossum 熔断器)
      → 3. 缺失 ticker → Go data-fetcher HTTP 调用 (semaphore=10)
        → data-fetcher 按优先级尝试: yfinance → finnhub → twelvedata → akshare
        → 写入缓存
      → 4. 返回 { data, degraded, degradedWarning }
```

---

## 5. 已实现功能清单

### 5.1 核心计算功能 (Go 引擎)

| 功能 | 端点 | 说明 |
|---|---|---|
| 组合回测 | POST /api/engine/backtest | 多组合回测 (增长曲线、回撤、统计指标) |
| 单资产分析 | POST /api/engine/analysis | 单个标的分析 |
| 组合优化 | POST /api/engine/optimize | maxSharpe/minVolatility/maxReturn |
| 有效前沿 | POST /api/engine/efficient-frontier | 有效前沿曲线 |
| 蒙特卡洛模拟 | POST /api/engine/monte-carlo | 块自举模拟 |
| 统计指标 | POST /api/engine/statistics | 100+ 指标计算 |
| 信号分析 | POST /api/engine/signal-analyze | 单/双/多信号 |
| PCA 分析 | POST /api/engine/pca | 主成分分析 |
| LETF 分析 | POST /api/engine/letf-analyze | 杠杆 ETF 滑点 |
| 目标优化 | POST /api/engine/goal-optimize | 基于目标的优化 |
| 战术分配 | POST /api/engine/tactical-backtest | 战术资产配置回测 |
| 战术网格搜索 | POST /api/engine/tactical-grid-search | 网格参数搜索 |
| 因子回归 | POST /api/engine/factor-regression | Fama-French 因子回归 |
| 金融计算器 | POST /api/engine/calculators | CAGR/SWR/有效前沿等 |

### 5.2 统计指标 (Statistics, 100+ 指标)

**核心收益**: CAGR, MWRR, 总收益, 最佳/最差/平均年收益
**波动率**: 年化/月/日标准差 (原始与年化)
**下行偏差**: 日/月/年下行标准差
**回撤**: 最大回撤, 最大回撤持续时间, 平均回撤, Ulcer 指数
**风险调整**: Sharpe, Sortino, Calmar, Ulcer Performance Index, M2, Treynor, 分散化比率
**基准相关**: Alpha, Beta, R², 跟踪误差, 信息比率, 上行/下行捕获率
**VaR/CVaR**: 日/月/年 × 99%/95%/90% 置信水平 (9+9 指标)
**分布特征**: 偏度, 超额峰度, 胜率 (日/月/年)
**极值**: 最佳/最差日/月/年收益
**盈亏比**: 平均盈亏, 盈亏比 (日/月/年)
**提款率**: SWR, PWR (10/20/30/40 年)

### 5.3 后端 API 功能

| 路由组 | 挂载路径 | 端点 | 权限 |
|---|---|---|---|
| 健康检查 | /api | GET /health, /ready, /metrics | 无 |
| 数据 | /api/v1/data | GET /history, /search, /cpi/:country | DATA_READ |
| 数据管理 | /api/v1/data/manage | 管理端点 | DATA_MANAGE |
| 回测 | /api/v1/backtest | POST /portfolio, /analysis, /monte-carlo, /optimize, /efficient-frontier, GET /search | BACKTEST_RUN |
| 回测优化器 | /api/v1/backtest-optimizer | 优化器端点 | OPTIMIZER_RUN |
| 战术分配 | /api/v1/tactical | 战术分配 | STRATEGY_MANAGE |
| 战术网格 | /api/v1/tactical-grid | 网格搜索 | STRATEGY_MANAGE |
| 信号 | /api/v1/signal | 信号分析 | SIGNAL_READ |
| 分析 | /api/v1 | PCA/LETF/因子回归/计算器 | 各权限 |
| 认证 | /api/v1/auth | 登录/注册/刷新/登出 | 无/JWT |
| 管理 | /api/v1/admin | 统计/系统 | ADMIN_ACCESS |
| API Key | /api/v1/keys | CRUD | ADMIN_ACCESS |
| 组合 | /api/v1/portfolios | CRUD | BACKTEST_RUN |
| 配置 | /api/v1/configs | 保存配置 | BACKTEST_RUN |
| 运行记录 | /api/v1/runs | 回测历史 | BACKTEST_RUN |
| 组织 | /api/v1/orgs | 组织管理 | JWT |
| 计费 | /api/v1/billing | 订阅/结账/门户 | JWT |
| 任务 | /api/v1 | 任务队列 | JWT |

### 5.4 前端页面

| 路由 | 页面 | 描述 |
|---|---|---|
| / | BacktestPage | 组合回测主页 |
| /analysis | AnalysisPage | 单资产分析 |
| /monte-carlo | MonteCarloPage | 蒙特卡洛模拟 |
| /optimizer | OptimizerPage | 组合优化 |
| /efficient-frontier | EfficientFrontierPage | 有效前沿 |
| /data-engine | DataEnginePage | 数据引擎 |
| /rebalancing-sensitivity | RebalancingSensitivityPage | 再平衡敏感度 |
| /lumpsum-vs-dca | LumpSumVsDCAPage | 一次性 vs 定投 |
| /factor-regression | FactorRegressionPage | 因子回归 |
| /calculators | CalculatorsPage | 金融计算器 |
| /tactical | TacticalPage | 战术分配 |
| /backtest-optimizer | BacktestOptimizerPage | 回测优化器 |
| /pca | PCAPage | PCA 分析 |
| /signal-analyzer | SignalAnalyzerPage | 信号分析 |
| /dual-signal | DualSignalPage | 双信号 |
| /multi-signal | MultiSignalPage | 多信号 |
| /letf-slippage | LETFSlippagePage | LETF 滑点 |
| /tactical-grid | TacticalGridPage | 战术网格 |
| /goal-optimizer | GoalOptimizerPage | 目标优化 |
| /login, /signup | 认证页面 | 登录/注册 |
| /admin | AdminDashboard | 管理后台 |
| /account, /billing | 账户页面 | 账户/计费 |

---

## 6. 测试覆盖分析

### 6.1 测试文件分布

| 测试类型 | 文件数 | 框架 | 环境 |
|---|---|---|---|
| 单元测试 (后端) | 143 | Vitest | Node |
| 单元测试 (前端) | 29 | Vitest + Testing Library | jsdom |
| 集成测试 | 17 | Vitest + Testcontainers | Node + Docker |
| 合约测试 | 1 | Vitest | Node |
| 混沌测试 | 5 | Vitest + Docker CLI | Node + Docker |
| 属性测试 | 1 | fast-check + Vitest | Node |
| E2E 测试 | 10 | Playwright | 浏览器 |
| Go 引擎测试 | 14 | Go testing | Go |
| Go 数据服务测试 | 11 | Go testing | Go |

### 6.2 单元测试按层分布

| 层 | 文件数 | 关键测试文件 |
|---|---|---|
| utils/ | 25 | engine-client, http-client, logger, errors, metrics, rate-limiter ... |
| routes/ | 26 | auth-routes, analysisRoutes, backtest-routes, admin-routes ... |
| services/ | 22 | data-service, user-service, billing-service, redis-client ... |
| middleware/ | 18 | jwt-auth(6文件), rbac, quota, tenant-context, idempotency ... |
| domain/ | 9 | portfolio-aggregate, run-aggregate, event-dispatcher ... |
| schemas/ | 11 | auth, backtest, signal, tactical, pca, letf ... |
| store/ | 8 | auth-store, backtest-store(4文件), toast-store ... |
| application/ | 9 | backtest-service, montecarlo-service, optimize-service ... |
| hooks/ | 5 | chart-interactions, use-async-action, useAnalysisData ... |
| components/ | 5 | chart-card, error-boundary, protected-route ... |
| db/ | 4 | macro-data, market-stats, pool, tenant |
| queues/ | 3 | backtest-queue, job-idempotency, worker |
| config/ | 2 | env, index |
| api/ | 2 | backtest-result-cache, compress-backtest-result |

### 6.3 覆盖率配置

| 项目 | 值 |
|---|---|
| Provider | v8 |
| 阈值 | lines ≥80%, functions ≥80%, branches ≥70%, statements ≥80% |
| 覆盖范围 | `packages/backend/src/**`, `packages/frontend/src/store/**`, `hooks/**`, `utils/**` |
| 当前覆盖率 | lines 26.44%, functions 71.03%, branches 82.59% |

### 6.4 Vitest 工作区配置

3 个项目:

| 项目 | 环境 | 包含 |
|---|---|---|
| **node** | Node | 后端单元 + 集成 + 合约 + 属性 + shared |
| **browser** | jsdom | 前端单元 + 组件 + hooks + store |
| **chaos** | Node | 混沌测试 (120s 超时) |

---

## 7. 关键模块详解

### 7.1 后端分层架构 (DDD + CQRS)

```
packages/backend/src/
├── app.ts              ← Express 应用组装 (中间件链 + 路由挂载)
├── server.ts           ← HTTP 服务器启动 + 优雅关闭 (30s 超时)
├── tracing.ts          ← OpenTelemetry 初始化
│
├── config/             ← 10 个配置片段 (碰撞检测)
│   ├── configObject.ts     ← 配置合成 + 碰撞检测
│   ├── serverConfig.ts     ← 端口/CORS/代理
│   ├── engineConfig.ts     ← Go 引擎 URL
│   ├── authConfig.ts       ← JWT/API Key
│   ├── databaseConfig.ts   ← PostgreSQL 连接
│   ├── integrationsConfig.ts ← Redis/Stripe/邮件
│   └── planLimits.ts       ← SaaS 配额
│
├── routes/             ← 20 个薄路由文件 (HTTP 适配器)
│   ├── backtestRoutes.ts    ← 7 个回测端点
│   ├── authRoutes.ts        ← 认证端点
│   ├── analysisRoutes.ts    ← 分析类端点 (ADR-042 合并)
│   ├── healthRoutes.ts      ← 健康检查
│   └── ...
│
├── middleware/         ← 17 个中间件
│   ├── jwtAuth.ts          ← JWT 认证 (Bearer/API Key/Dev 回退)
│   ├── jwtVerify.ts        ← JWT 验证 (RS256/HS256)
│   ├── refreshToken.ts     ← 刷新令牌管理
│   ├── rbac.ts             ← RBAC (3 角色 × 7 权限)
│   ├── tenantContext.ts    ← 多租户上下文
│   ├── apiKeyAuth.ts       ← API Key 认证 (ADR-033)
│   ├── auditLog.ts         ← 审计日志
│   ├── idempotency.ts      ← 幂等性
│   ├── quota.ts            ← 配额限制
│   ├── validate.ts         ← Zod 校验
│   ├── errorHandler.ts     ← RFC 7807 错误
│   └── middlewareChains.ts ← 可组合中间件链
│
├── application/        ← 14 个应用服务
│   ├── backtest-service.ts      ← 回测编排 (领域校验→数据→引擎→事件)
│   ├── analysis-orchestrator.ts ← PCA/LETF/目标优化编排
│   ├── montecarlo-service.ts    ← 蒙特卡洛编排
│   ├── optimize-service.ts      ← 优化器 + 有效前沿
│   ├── tactical-application-service.ts ← 战术分配
│   ├── signal-orchestrator.ts   ← 信号分析
│   ├── grid-application-service.ts ← 网格搜索
│   ├── backtest/                ← 缓存/压缩/引擎参数
│   ├── auth/                    ← 认证服务
│   ├── billing/                 ← Stripe 计费
│   └── org/                     ← 组织/邀请
│
├── domain/             ← DDD 领域层
│   ├── aggregates/
│   │   ├── portfolio.ts    ← 组合聚合根 (权重校验/持仓/集中度)
│   │   └── run.ts          ← 运行聚合根 (状态机: queued→running→completed/failed/cancelled)
│   ├── events/
│   │   ├── EventDispatcher.ts ← 事件分发器 (pub/sub)
│   │   └── runEvents.ts       ← 事件类型常量
│   ├── services/
│   │   ├── grid-search.ts      ← 网格搜索域服务
│   │   └── optimizer-domain.ts ← 优化器域服务
│   ├── value-objects/
│   │   ├── ticker.ts           ← Ticker 值对象 (净化/格式校验)
│   │   ├── weight.ts           ← Weight 值对象 (0-100 校验)
│   │   └── index.ts
│   └── errors.ts               ← 领域验证错误
│
├── infrastructure/     ← 12 个基础设施文件
│   ├── dataFacade.ts      ← 数据服务外观 (PostgreSQL 主 → Go 回退)
│   ├── dataQuery.ts       ← 数据库查询 (熔断器 + 信号量)
│   ├── dataCache.ts       ← 文件缓存
│   ├── dataFetch.ts       ← 数据获取
│   ├── redisClient.ts     ← Redis 客户端
│   ├── outboxPublisher.ts ← Outbox 发布器
│   ├── outboxWriter.ts    ← Outbox 写入器
│   └── tickerDataService.ts ← Ticker 数据统计
│
├── repositories/       ← 8 个仓库
│   ├── userRepo.ts, apiKeyRepo.ts, orgRepo.ts
│   ├── membershipRepo.ts, portfolioRepo.ts
│   ├── savedConfigRepo.ts, backtestRunRepo.ts
│   └── invitationRepo.ts
│
├── db/                 ← 6 个数据库文件
│   ├── pool.ts, migrations.ts
│   ├── macroData.ts, marketStats.ts
│   └── marketStatsHelpers.ts, marketStorageStats.ts
│
├── schemas/            ← 14 个 Zod 校验模式
│   ├── backtest.ts, auth.ts, signal.ts, tactical.ts
│   ├── pca.ts, letf.ts, goal-optimizer.ts
│   └── ...
│
├── queues/             ← 3 个队列文件
│   ├── backtestQueue.ts, worker.ts, jobIdempotency.ts
│
└── utils/              ← 17 个工具模块
    ├── engineClient.ts      ← Go 引擎调用 (opossum 熔断器 + 指数退避)
    ├── httpClient.ts        ← HTTP 客户端
    ├── rateLimiter.ts       ← 6 种限流器 (Redis-backed)
    ├── metrics.ts           ← Prometheus 指标
    ├── logger.ts            ← Pino 日志
    ├── errors.ts            ← RFC 7807 错误类型
    └── ...
```

### 7.2 Go 引擎内部结构

```
engine-go/
├── cmd/server/main.go      ← 入口: 初始化 OTel/日志, 启动 Gin 服务器
├── internal/
│   ├── server/
│   │   ├── router.go            ← 路由注册 (14 个计算端点)
│   │   ├── handler_backtest.go  ← 回测处理器
│   │   ├── handler_optimize.go  ← 优化器/蒙特卡洛/目标优化
│   │   ├── handler_analysis.go  ← 分析/PCA/LETF/因子回归
│   │   ├── handler_tactical.go  ← 战术分配/网格搜索/信号
│   │   ├── handler_calculators.go ← 金融计算器
│   │   └── helpers.go           ← 共享辅助函数
│   ├── engine/
│   │   ├── backtest.go           ← RunBacktest 主入口
│   │   ├── backtest_curve.go     ← 增长曲线计算
│   │   ├── backtest_helpers.go   ← 辅助函数
│   │   ├── backtest_stats.go     ← 统计指标
│   │   ├── drawdown.go           ← 回撤计算
│   │   ├── drawdown_test.go      ← 回撤测试
│   │   ├── fingerprint.go        ← 确定性指纹
│   │   ├── statistics.go         ← 统计计算
│   │   ├── statistics_risk.go    ← 风险指标
│   │   ├── statistics_returns.go ← 收益指标
│   │   ├── types.go              ← 类型定义 (300 行, 共享类型)
│   │   ├── types_test.go         ← 类型 JSON 标签测试
│   │   └── tactical/             ← 战术分配子引擎
│   ├── montecarlo/           ← 蒙特卡洛模拟 (6 文件)
│   ├── optimizer/            ← 组合优化 (6 文件, 闭式解 + 随机搜索)
│   ├── analysis/             ← 单资产分析 (2 文件)
│   ├── pca/                  ← PCA 主成分分析 (1 文件)
│   ├── letf/                 ← 杠杆 ETF 分析
│   ├── signal/               ← 信号分析 (5 文件)
│   ├── calculators/          ← 金融计算器 (1 文件)
│   ├── indicators/           ← 技术指标 (SMA/EMA/RSI/MACD/布林带/动量)
│   ├── factorregression/     ← Fama-French 因子回归
│   ├── goaloptimizer/        ← 目标优化
│   ├── engineutil/           ← 引擎工具
│   ├── mathutil/             ← 数学工具
│   └── middleware/           ← 限流/认证/安全头
```

### 7.3 Go 数据服务内部结构

```
data-fetcher/
├── main.go                 ← 入口: 注册表 + 路由 + 服务器
├── main_test.go
├── auth_test.go
├── baostock/               ← 中国股票市场数据协议
│   ├── baostock.go
│   ├── baostock_parse.go
│   ├── baostock_protocol.go
│   └── baostock_test.go
├── cmd/
│   ├── bs_smoke/           ← Baostock 冒烟测试
│   └── worker/             ← 后台工作进程
├── internal/
│   ├── handlers/           ← HTTP 处理器
│   │   ├── data.go          ← 数据端点处理器
│   │   └── baostock.go      ← Baostock 端点处理器
│   ├── provider/           ← 数据源注册表
│   │   ├── registry.go      ← 注册表 + 熔断器
│   │   ├── provider_test.go
│   │   └── exchange_test.go
│   ├── store/              ← PostgreSQL 存储
│   │   └── store.go
│   ├── yfinance/           ← Yahoo Finance 数据源
│   ├── finnhub/            ← Finnhub 数据源
│   ├── twelvedata/         ← Twelve Data 数据源
│   ├── akshare/            ← AKShare 数据源 (中国 A 股)
│   ├── httpclient/         ← HTTP 客户端 + 熔断器
│   ├── middleware/         ← 认证中间件
│   └── providerutil/       ← 数据源工具
```

### 7.4 共享包

```
packages/shared/
├── constants.ts            ← 常量 (MAX_TICKERS=50, 交易日=252, 颜色等)
└── types/
    ├── index.ts            ← 桶导出
    ├── portfolio.ts        ← 组合/资产/再平衡/现金流类型
    ├── backtest.ts         ← 回测参数/结果/价格数据
    ├── statistics.ts       ← 100+ 统计指标接口
    ├── monte-carlo.ts      ← 蒙特卡洛类型
    ├── optimizer.ts        ← 优化器/有效前沿类型
    ├── tactical.ts         ← 战术分配/信号条件/网格搜索
    ├── signal.ts           ← 信号分析类型
    ├── pca.ts              ← PCA 类型
    ├── letf.ts             ← LETF 类型
    ├── goal.ts             ← 目标优化类型
    ├── marketStats.ts      ← 市场统计类型
    └── org.ts              ← 组织类型

packages/go-shared/         ← Go 共享库
├── go.mod                  ← module: github.com/backtest/go-shared
├── http/
│   ├── server.go           ← 共享 HTTP 服务器 (优雅关闭)
│   └── pprof.go            ← pprof 在线诊断
├── middleware/
│   ├── auth.go             ← 共享认证中间件
│   └── security.go         ← 安全头
├── observability/
│   └── otel.go             ← OTel + Prometheus 初始化
└── log/
    └── log.go              ← 日志初始化
```

---

## 8. 关键架构决策 (ADRs)

| ADR | 决策 | 类别 |
|---|---|---|
| ADR-004 | Express 而非 Fastify/NestJS | 框架 |
| ADR-007 | PostgreSQL 而非 SQLite | 数据库 |
| ADR-008 | Go + TypeScript 而非 4 语言 | 语言 |
| ADR-009 | Zod 而非 Joi/class-validator | 校验 |
| ADR-013 | DDD 聚合 + 事件溯源 | 领域 |
| ADR-014 | Outbox 模式 | 数据一致性 |
| ADR-015 | OpenTelemetry | 可观测性 |
| ADR-016 | 熔断器 (opossum + gobreaker) | 弹性 |
| ADR-017 | JWT + RBAC (3 角色 × 7 权限) | 认证 |
| ADR-018 | Redis 用于会话/限流/缓存 | 缓存 |
| ADR-031 | 单一 Go 引擎 fail-closed (无 Node/Rust 回退) | 弹性 |
| ADR-032 | 多租户 RLS 隔离 | 多租户 |
| ADR-033 | 按组织 API 密钥 | 认证 |
| ADR-036 | Stripe 计费 | 计费 |
| ADR-037 | 配额计量 + 公平调度 | 多租户 |
| ADR-042 | API 包合并 | 架构 |
| ADR-044 | OTel SaaS 替换 | 可观测性 |

---

## 9. 数据库 Schema (15 个迁移版本)

| 迁移 | 描述 | 关键表 |
|---|---|---|
| 001_init | 初始 Schema | tickers, prices, cpi_data, exchange_rates |
| 002_fts | 全文搜索 | tickers 全文搜索向量 |
| 003_index_cleanup | 索引清理 | — |
| 004_users | 用户表 | users (username, password_hash, role) |
| 005_outbox | Outbox 表 | outbox |
| 006_outbox_dedup | Outbox 去重 | — |
| 007_least_privilege | 最小权限角色 | backtest_app 角色 |
| 008_checks | 约束检查 | — |
| 009_tenancy | 多租户 RLS | organizations, memberships, api_keys, portfolios, saved_configs, backtest_runs |
| 010_user_email | 邮箱验证 | users.email_verified |
| 011_billing | Stripe 计费 | stripe_customers, subscriptions |
| 012_usage | 用量计量 | usage_events, usage_counters |
| 013-015 | 清理优化 | 索引/约束/列调整 |

**核心表**: tickers, prices, cpi_data, exchange_rates, users, organizations, memberships, api_keys, portfolios, saved_configs, backtest_runs, outbox, stripe_customers, subscriptions, usage_events, usage_counters

---

## 10. 关键类/函数/模块详解

### 10.1 `Portfolio` 聚合根 (`packages/backend/src/domain/aggregates/portfolio.ts`)

DDD 充血模型，封装组合业务规则:

- **`fromDTO(dto)`**: 从请求 DTO 构造聚合根，通过 Ticker/Weight 值对象逐资产净化
- **`validateWeightSum()`**: 构造时校验权重和 ≈ 100 (±1% 容差)
- **`toEngineBody()`**: 序列化为 Go 引擎请求体 (值对象生命周期终点)
- **`toPersistenceDTO()`**: 序列化为持久化 DTO
- **`rebalance(targetWeights)`**: 调整权重 (返回新对象，不可变)
- **`needsRebalance()`**: 检查是否需要再平衡
- **`isConcentrated`**: 单一持仓 > 40% 阈值
- **`addHolding()` / `removeHolding()`**: 不可变持仓操作

### 10.2 `Run` 聚合根 (`packages/backend/src/domain/aggregates/run.ts`)

状态机模式:

- **状态**: `queued → running → completed/failed/cancelled`
- **`create()`**: 初始 `queued` 状态，发布 `RunStarted` 事件
- **`start()`**: `queued → running`
- **`complete(result)`**: `running → completed`，发布 `RunCompleted` 事件
- **`fail(reason)`**: `running → failed`，发布 `RunFailed` 事件
- **`cancel()`**: `queued|running → cancelled`，发布 `RunCancelled` 事件
- **`pullEvents()`**: 取出累积事件并清空 (事件溯源模式)
- **不变量**: 终态后不可再转换状态

### 10.3 `runPortfolioBacktest()` (`packages/backend/src/application/backtest-service.ts`)

回测编排主入口:

```
领域校验 → 数据获取 → 无效标的检测 → 宏观数据加载 →
引擎调用(带超时) → 缓存写入 → 结果压缩 → 事件发布
```

- 双通道事件发布: eventDispatcher (进程内同步) + outbox (最终一致性)
- 使用 OTel span 追踪全链路
- 调用 `callEngineStrict()` 经熔断器调用 Go 引擎

### 10.4 `callEngineStrict()` (`packages/backend/src/utils/engineClient.ts`)

Go 引擎调用客户端 (ADR-031 fail-closed):

- **opossum 熔断器**: 50% 错误阈值, 30s 重置, 5 次最小请求
- **指数退避重试**: 最多 2 次重试, 200ms 基数
- **4xx 透传**: `UpstreamProblemError` 不重试
- **5xx fail-closed**: `EngineUnavailableError` → 503 + Retry-After
- **可选 Zod 校验**: 对引擎响应做运行时校验

### 10.5 `fetchHistoryData()` (`packages/backend/src/infrastructure/dataFacade.ts`)

数据检索编排:

```
验证 ticker → PostgreSQL 查询 (熔断器) →
缺失标的 → 文件缓存检查 → Go data-fetcher 实时拉取 →
返回 { data, degraded, degradedWarning }
```

- 降级信息通过返回值传递 (P0 修复, 消除全局变量数据竞争)
- OTel span 追踪
- 非法 ticker 自动过滤

### 10.6 `jwtAuth` 中间件 (`packages/backend/src/middleware/jwtAuth.ts`)

统一认证入口:

```
认证优先级:
1. Authorization: Bearer <token> → JWT 验证 (RS256/HS256)
2. x-api-key header → per-org API Key 验证 (ADR-033)
3. 开发环境 → 注入 readonly/analyst 用户
```

- `handleBearerTokenAuth()`: JWT 验证 + 吊销检查 + 停用检查
- `optionalJwtAuth`: 可选认证 (失败时匿名放行)
- `assignGuestAnalyst`: 匿名用户注入 analyst 角色
- `assignGuestReadonly`: 匿名用户注入 readonly 角色

### 10.7 `requirePermission()` (`packages/backend/src/middleware/rbac.ts`)

RBAC 权限模型:

- **3 角色**: ADMIN (全部), ANALYST (6 权限), READONLY (2 权限)
- **7 权限**: BACKTEST_RUN, DATA_MANAGE, DATA_READ, ADMIN_ACCESS, OPTIMIZER_RUN, SIGNAL_READ, STRATEGY_MANAGE
- 多租户角色: 优先使用 `org_role` (JWT 中), 回退到全局 `role`
- 平台管理员 (`platform_admin=true`) 无条件放行

### 10.8 `RunBacktest()` (`engine-go/internal/engine/backtest.go`)

Go 引擎回测主入口:

```
解析交易日 → 日期范围过滤 → 收集资产 ticker →
计算基准增长曲线 → 计算每个组合:
  增长曲线 → 回撤曲线 → 回撤事件检测 → 统计指标 →
  滚动收益 → 年度/月度收益
→ 组合间相关性矩阵 → 资产间相关性矩阵 → 可选指纹
```

- 每个组合前检查 `ctx.Done()` (超时控制)
- 统一 camelCase JSON 标签 (与 TypeScript 接口一致)

### 10.9 `Statistics` 结构体 (`engine-go/internal/engine/types.go`)

175 行, 80+ 指标, 与 `packages/shared/types/statistics.ts` 完全对齐:

- 核心收益 (CAGR, MWRR, 总收益)
- 波动率 (年/月/日, 原始/年化)
- 下行偏差 (年/月/日)
- 回撤 (最大回撤, 持续时间, Ulcer)
- 风险调整 (Sharpe, Sortino, Calmar, M2, Treynor)
- 基准相关 (Alpha, Beta, R², 捕获率)
- VaR/CVaR (日/月/年 × 99%/95%/90%)
- 分布特征 (偏度, 超额峰度, 胜率)
- 提款率 (SWR, PWR, 10/20/30/40 年)

### 10.10 `app.ts` 中间件链 (`packages/backend/src/app.ts`)

Express 应用组装 (199 行):

```
Helmet (安全头) → CORS → 压缩 → Request ID → Prometheus 指标 →
Stripe webhook (原始 body) → JSON 解析 → 限流器 →
健康检查 → 全局限流 → 路由挂载 (20 组) → 静态文件 + SPA 回退 → 错误处理
```

---

## 11. 基础设施

### 11.1 Docker Compose (5 服务)

| 服务 | 镜像 | 端口 | 说明 |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | 主数据库 |
| redis | redis:7-alpine | 6379 | 缓存/会话/队列 |
| engine-go | 自定义 Go | 5004 | 计算引擎 |
| api | 自定义 Node | 5001 | API 服务器 |
| frontend | 自定义 Nginx | 80 | 前端 SPA |
| data-fetcher | 自定义 Go | 5003 | 数据服务 |

### 11.2 Kubernetes (24 文件)

- API: `api-deployment.yaml`, `api-service.yaml`, `api-hpa.yaml`, `api-pdb.yaml`
- 前端: `frontend-deployment.yaml`, `frontend-service.yaml`
- 引擎: `engine-go-deployment.yaml`, `engine-go-service.yaml`, `engine-go-pdb.yaml`
- 数据: `data-fetcher-deployment.yaml`, `data-fetcher-service.yaml`, `data-fetcher-pdb.yaml`
- 金丝雀: `canary-deployment.yaml`
- 入口: `ingress.yaml`
- 数据库: `postgres.yaml`, `pgbouncer.yaml`
- Redis: `redis.yaml`
- OTel: `otel-collector.yaml`
- mTLS: `mtls-issuer.yaml`

### 11.3 CI/CD (GitHub Actions)

| 工作流 | 触发条件 | 关键任务 |
|---|---|---|
| CI | push/main + PR | gitleaks, node-quick (5 并行), go 测试, 集成, 合约, E2E, 混沌 |
| Nightly | 每日 02:00 CST | Go 引擎和数据服务基准测试 |
| Release | tag v* | 发布流程 |

---

## 12. 已知问题与注意事项

### 12.1 架构注意事项

1. **Go 引擎数据服务信号量=10**: `dataQuery.ts` 中 `goServiceSemaphore = new Semaphore(10)` 限制并发 Go HTTP 调用
2. **单 Go 引擎 + fail-closed**: Go 引擎是唯一的回测/MC/优化器引擎, 不可用时返回 503, 永不静默降级
3. **x-api-key 兼容风险**: 仅 `ADMIN_API_KEY` 作为平台 break-glass 静态凭证不可吊销
4. **Redis 依赖**: 认证模块使用 Redis 存储刷新令牌, Redis 故障降级为内存模式 (单实例)
5. **CORS_ORIGINS=true 生产环境**: 生产环境 hard-fail, 仅开发环境降级为 warning
6. **RFC 7807 错误格式**: 所有 API 错误使用 `{ success: false, error: { type, title, status, code, detail } }`
7. **API 版本化**: 所有路由挂载在 `/api/v1/`, 旧 `/api/` 路径已废弃
8. **降级模式**: 响应中包含 `degraded: true` + `degradedWarning`, 前端必须展示

### 12.2 代码质量注意事项

1. **覆盖率**: 当前 lines 覆盖率仅 26.44%, 远低于 80% 阈值, 主要在 backend 层
2. **测试文件占比**: 测试文件仅占 3.9% (39,097 行), 非测试占 96.1%
3. **最大测试文件**: `jwt-auth.hs256.test.ts` (1,051 行) 和 `analysisRoutes.test.ts` (871 行) 体量较大
4. **Go 测试**: 14 个引擎测试文件 + 11 个数据服务测试文件, 覆盖核心计算逻辑
5. **前端组件测试**: 仅 5 个组件测试文件, 覆盖面有限

---

## 13. 文件清单 (关键文件)

### 13.1 后端核心

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `packages/backend/src/app.ts` | 199 | Express 应用组装 |
| `packages/backend/src/server.ts` | 92 | HTTP 服务器 + 优雅关闭 |
| `packages/backend/src/routes/backtestRoutes.ts` | 322 | 回测路由 |
| `packages/backend/src/routes/authRoutes.ts` | ~500 | 认证路由 |
| `packages/backend/src/routes/analysisRoutes.ts` | ~587 | 分析路由 (合并) |
| `packages/backend/src/application/backtest-service.ts` | 277 | 回测编排 |
| `packages/backend/src/application/analysis-orchestrator.ts` | — | 分析编排 |
| `packages/backend/src/application/montecarlo-service.ts` | — | 蒙特卡洛编排 |
| `packages/backend/src/application/optimize-service.ts` | — | 优化器编排 |
| `packages/backend/src/domain/aggregates/portfolio.ts` | 294 | 组合聚合根 |
| `packages/backend/src/domain/aggregates/run.ts` | 262 | 运行聚合根 |
| `packages/backend/src/domain/events/EventDispatcher.ts` | — | 事件分发器 |
| `packages/backend/src/domain/value-objects/ticker.ts` | — | Ticker 值对象 |
| `packages/backend/src/domain/value-objects/weight.ts` | — | Weight 值对象 |
| `packages/backend/src/middleware/jwtAuth.ts` | 246 | JWT 认证中间件 |
| `packages/backend/src/middleware/jwtVerify.ts` | — | JWT 验证 |
| `packages/backend/src/middleware/rbac.ts` | 201 | RBAC 权限 |
| `packages/backend/src/middleware/tenantContext.ts` | — | 多租户上下文 |
| `packages/backend/src/middleware/idempotency.ts` | — | 幂等性 |
| `packages/backend/src/middleware/errorHandler.ts` | — | 错误处理器 |
| `packages/backend/src/utils/engineClient.ts` | 158 | 引擎调用客户端 |
| `packages/backend/src/utils/errors.ts` | 171 | RFC 7807 错误 |
| `packages/backend/src/utils/rateLimiter.ts` | — | 6 种限流器 |
| `packages/backend/src/utils/httpClient.ts` | — | HTTP 客户端 |
| `packages/backend/src/utils/metrics.ts` | — | Prometheus 指标 |
| `packages/backend/src/utils/logger.ts` | — | Pino 日志 |
| `packages/backend/src/infrastructure/dataFacade.ts` | 224 | 数据服务外观 |
| `packages/backend/src/infrastructure/dataQuery.ts` | — | 数据库查询 |
| `packages/backend/src/infrastructure/dataCache.ts` | — | 文件缓存 |
| `packages/backend/src/infrastructure/redisClient.ts` | — | Redis 客户端 |
| `packages/backend/src/infrastructure/outboxPublisher.ts` | — | Outbox 发布器 |
| `packages/backend/src/infrastructure/outboxWriter.ts` | — | Outbox 写入器 |
| `packages/backend/src/config/configObject.ts` | 65 | 配置合成 |
| `packages/backend/src/config/engineConfig.ts` | — | 引擎配置 |
| `packages/backend/src/config/authConfig.ts` | — | 认证配置 |
| `packages/backend/src/config/planLimits.ts` | — | 配额配置 |

### 13.2 前端核心

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `packages/frontend/src/App.tsx` | 47 | 应用根组件 |
| `packages/frontend/src/main.tsx` | — | 入口 |
| `packages/frontend/src/store/backtestStore.ts` | 27 | Zustand 回测状态 |
| `packages/frontend/src/store/portfolioSlice.ts` | — | 组合 slice |
| `packages/frontend/src/store/executionSlice.ts` | — | 执行 slice |
| `packages/frontend/src/store/cashflowSlice.ts` | — | 现金流 slice |
| `packages/frontend/src/store/authStore.ts` | — | 认证状态 |
| `packages/frontend/src/routes/index.tsx` | — | 工具路由 |

### 13.3 Go 引擎核心

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `engine-go/cmd/server/main.go` | 54 | 入口 |
| `engine-go/internal/server/router.go` | 103 | 路由注册 |
| `engine-go/internal/server/handler_backtest.go` | — | 回测处理器 |
| `engine-go/internal/engine/backtest.go` | 187 | 回测主入口 |
| `engine-go/internal/engine/backtest_curve.go` | — | 增长曲线 |
| `engine-go/internal/engine/backtest_stats.go` | — | 统计指标 |
| `engine-go/internal/engine/drawdown.go` | — | 回撤计算 |
| `engine-go/internal/engine/types.go` | 300 | 类型定义 |

### 13.4 Go 数据服务核心

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `data-fetcher/main.go` | 155 | 入口 |
| `data-fetcher/internal/handlers/data.go` | — | 数据处理器 |
| `data-fetcher/internal/provider/registry.go` | — | 数据源注册表 |
| `data-fetcher/internal/store/store.go` | — | PostgreSQL 存储 |

### 13.5 共享包

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `packages/shared/types/portfolio.ts` | 103 | 组合类型 |
| `packages/shared/types/backtest.ts` | 127 | 回测类型 |
| `packages/shared/types/statistics.ts` | 335 | 统计指标类型 |
| `packages/shared/constants.ts` | — | 常量 |

### 13.6 配置/基础设施

| 文件路径 | 行数 | 说明 |
|---|---|---|
| `vitest.workspace.ts` | 189 | Vitest 工作区 |
| `vite.config.ts` | 141 | Vite 配置 |
| `playwright.config.ts` | — | Playwright 配置 |
| `eslint.config.js` | 147 | ESLint 配置 |
| `docker-compose.yml` | — | Docker Compose |
| `pnpm-workspace.yaml` | — | pnpm 工作区 |
| `.env.example` | 180 | 环境变量模板 |
| `docs/openapi.yaml` | 5,410 | OpenAPI 3.0 规范 |
| `migrations/` | 30 文件 | 15 个数据库迁移 |

---

## 14. NPM 脚本命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm run test` | 全部 Vitest 测试 |
| `npm run test:unit` | 单元测试 |
| `npm run test:unit:frontend` | 前端单元测试 |
| `npm run test:unit:backend` | 后端单元测试 |
| `npm run test:integration` | 集成测试 |
| `npm run test:contract` | 合约测试 |
| `npm run test:chaos` | 混沌测试 |
| `npm run test:property` | 属性测试 |
| `npm run test:e2e:ui` | Playwright E2E |
| `npm run test:coverage` | 覆盖率报告 |
| `npm run test:coverage:check` | 覆盖率检查 |

---

## 15. 总结

回测平台是一个**企业级量化投资分析平台**, 采用 **TypeScript + Go 双语言微服务架构**:

- **前端**: React 18 + Zustand + Recharts + Tailwind CSS, 包含 19 个核心工具页面和完整的中英双语国际化
- **后端**: Express 4 + DDD/CQRS 架构, 20 个路由组, 17 个中间件, 14 个应用服务, 完整的多租户 RBAC 和 Stripe 计费
- **计算引擎**: Go + Gin + Gonum, 14 个计算端点, 100+ 统计指标, 涵盖回测/优化/蒙特卡洛/PCA/信号/战术分配等全部金融计算
- **数据服务**: Go + Gin + pgx, 5 个数据源降级链 (yfinance→finnhub→twelvedata→akshare), 支持中国 A 股 (Baostock)
- **基础设施**: PostgreSQL 16 + Redis 7 + BullMQ + Docker Compose + Kubernetes + GitHub Actions CI/CD
- **质量**: 207 个测试文件, 6 种测试类型 (单元/集成/合约/混沌/属性/E2E), 覆盖 14 个后端层
- **架构决策**: 30+ ADRs 覆盖框架/数据库/安全/多租户/可观测性/弹性等所有方面