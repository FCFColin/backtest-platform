# 运维指南（前端 + 运行命令 + 已知坑点）

> 合并自: wiki/frontend.md + wiki/gotchas.md + wiki/running.md

## 1. 前端架构概览

### 目录结构 (packages/frontend/src/)

    pages/          路由页面（BacktestPage, AnalysisPage, MonteCarloPage 等）
    components/     通用组件（Chart, PortfolioTable, Layout）
    store/          Zustand 状态（authStore, backtestStore）
    utils/          工具（apiClient, authTokens, calculations）
    hooks/          自定义 hooks（useBacktestWs）
    i18n/           国际化（中/英双语）
    styles/         Tailwind CSS

### 路由: / (BacktestPage), /analysis, /monte-carlo, /optimizer, /efficient-frontier, /factor-regression, /calculators, /data-engine, /login, /signup, /account

### 技术栈: Zustand（无 persist）, apiClient（Bearer token + 401 自动刷新）, Recharts, Tailwind CSS 3, Playwright E2E

## 2. 前置要求

Node.js 20+, Go 1.26+, pnpm, PostgreSQL 14+, Redis 6+

## 3. 环境变量速查

| 类别     | 关键变量                                                          |
| -------- | ----------------------------------------------------------------- |
| 基础     | NODE_ENV, PORT(15001), FRONTEND_PORT(15173)                       |
| Go 引擎  | GO_ENGINE_URL(127.0.0.1:15004), DATA_SERVICE_URL(127.0.0.1:15003) |
| CORS     | CORS_ORIGINS(生产必填, 逗号分隔; 开发 true 允许全部)              |
| 数据库   | DATABASE_URL, PG_SSL_REQUIRED(生产 true)                          |
| Redis    | REDIS_URL, REDIS_TLS_REQUIRED(生产 true)                          |
| 认证     | JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, DEV_SKIP_AUTH(开发 only)         |
| 可观测性 | OTEL_EXPORTER_OTLP_ENDPOINT, LOG_LEVEL                            |
| Stripe   | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                          |

## 4. 开发模式

### 标准启动

    pnpm install
    pnpm dev          # 前端(15173) + 后端 API(15001)
    cd engine-go && go run cmd/server/main.go    # Go 引擎 :15004
    cd data-fetcher && go run cmd/server/main.go # Go 数据服务 :15003

### SaaS 一键启动: pnpm dev:saas（含 PostgreSQL + Redis docker-compose）

## 5. 类型检查 / Lint / 构建

    pnpm check        # tsc --noEmit
    pnpm lint         # ESLint
    pnpm build        # Vite + tsc 构建

## 6. 测试命令

| 命令                  | 说明                                |
| --------------------- | ----------------------------------- |
| pnpm test             | 全部测试                            |
| pnpm test:unit        | 单元测试（mocks, 无 DB）            |
| pnpm test:integration | 集成测试（testcontainers）          |
| pnpm test:contract    | OpenAPI 契约（>= 95%）              |
| pnpm test:chaos       | 混沌实验（需 Docker）               |
| pnpm test:property    | 属性测试（fast-check）              |
| pnpm test:e2e:ui      | Playwright E2E                      |
| pnpm test:docker      | 全量 Vitest（RUN_TESTCONTAINERS=1） |

覆盖率门控: lines/functions >= 80%, branches >= 70%。

## 7. Docker 全栈

    docker compose up -d                    # 启动全栈
    docker compose -f docker-compose.chaos.yml up -d  # chaos 测试栈
    docker compose down                     # 停止

## 8. 端口映射速查

| 端口  | 服务        |
| ----- | ----------- |
| 15173 | 前端 Vite   |
| 15001 | 后端 API    |
| 15004 | Go 引擎     |
| 15003 | Go 数据服务 |
| 5432  | PostgreSQL  |
| 6379  | Redis       |
| 9090  | Prometheus  |
| 3000  | Grafana     |

## 9. 已知坑点

### 通用（AGENTS.md 已记录）

1. Go 数据服务 semaphore=10: dataQuery.ts 限制并发 Go HTTP 调用
2. 单 Go 引擎 + fail-closed: 不可用时 503 + Retry-After（ADR-031）
3. x-api-key 兼容风险: ADR-017 已支持按组织密钥, ADMIN_API_KEY 不可吊销
4. Redis 依赖: 认证用 Redis, 故障时 fail-closed 503（ADR-018）
5. CORS_ORIGINS=true: 生产 hard-fail, 开发降级为 warning
6. RFC 7807 错误格式: { success: false, error: { type, title, status, code, detail } }
7. API 版本: /api/v1/*, 旧 /api/ 已废弃
8. 降级模式: 数据服务降级含 degraded: true; 引擎 fail-closed 无 degraded 字段

### 前端坑点

| 坑点                | 说明                      |
| ------------------- | ------------------------- |
| 遗留 slice 死代码   | 部分 Zustand slice 未清理 |
| CSV 导出重复实现    | 多处独立实现              |
| react-router-dom v7 | 注意兼容性                |
| 无 persist 中间件   | authStore 不持久化        |
| Module Federation   | ADR-050 预留软依赖        |

### 后端坑点

| 坑点               | 说明                                    |
| ------------------ | --------------------------------------- |
| API Key 路径       | /api/v1/keys（非 /api/v1/api-keys）     |
| services/ 已消除   | 迁入 application/ + infrastructure/     |
| Worker 独立进程    | BullMQ worker 与 API 分离               |
| Stripe Webhook     | 独立挂载（Stripe 签名验证, 无 jwtAuth） |
| 熔断器实例         | opossum（Node）+ gobreaker（Go）        |
| OTel + prom-client | 指标走 Prometheus, 追踪走 OTLP          |

### Go 引擎坑点

| 坑点               | 说明                                                    |
| ------------------ | ------------------------------------------------------- |
| withComputeHandler | 所有计算端点共用统一模式                                |
| PowerShell BOM     | 用 [System.IO.File]::WriteAllText（UTF8Encoding False） |
| 降级语义           | data-fetcher 降级有 degraded 标记, 引擎 fail-closed 无  |
| 健康检查 503       | 引擎不可用返回 503, 非 200+degraded                     |

### 数据库坑点

| 坑点                 | 说明                                      |
| -------------------- | ----------------------------------------- |
| audit_logs 链式 hash | HMAC-SHA256, 不可篡改                     |
| RLS 不启用表         | 市场数据/审计/outbox 有意为之             |
| FORCE RLS            | 迁移 031, backtest_app 不得 BYPASSRLS     |
| PgBouncer            | 必须用 SET LOCAL（非 SET）防串租户        |
| Redis 策略分化       | 认证 fail-closed, 数据缓存跳过（ADR-045） |

## 10. Git 工作流

Conventional Commits: type(scope): description。分支 feature/* / fix/* / refactor/* to PR to main（protected）。husky + lint-staged: pre-commit 运行 eslint --fix + prettier --write。
