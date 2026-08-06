# 运维指南（前端 + 运行命令 + 已知坑点）

## 1. 前端概览

目录: `pages/`（BacktestPage, AnalysisPage 等）、`components/`、`store/`（Zustand 无 persist）、`utils/`、`hooks/`、`i18n/`、`styles/`。

路由: `/` (BacktestPage), /analysis, /monte-carlo, /optimizer, /efficient-frontier, /factor-regression, /calculators, /data-engine, /login, /signup, /account。

技术栈: apiClient（Bearer + 401 自动刷新）、Recharts、Tailwind 3、Playwright E2E。

## 2. 前置要求与开发

Node.js 20+, Go 1.26+, pnpm, PostgreSQL 14+, Redis 6+。

    pnpm install
    pnpm dev          # 前端(15173) + 后端 API(15001)
    cd engine-go && go run cmd/server/main.go     # Go 引擎 :15004
    cd data-fetcher && go run cmd/server/main.go  # Go 数据服务 :15003

## 3. 环境变量速查

| 类别              | 关键变量                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------- |
| 基础 / Go 引擎    | NODE_ENV, PORT(15001), FRONTEND_PORT(15173) / GO_ENGINE_URL(:15004), DATA_SERVICE_URL(:15003) |
| CORS / 数据库     | CORS_ORIGINS（生产必填；开发 true 允许全部）/ DATABASE_URL, PG_SSL_REQUIRED                   |
| Redis / 认证      | REDIS_URL, REDIS_TLS_REQUIRED / JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, DEV_SKIP_AUTH                |
| 可观测性 / Stripe | OTEL_EXPORTER_OTLP_ENDPOINT, LOG_LEVEL / STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET             |

## 4. 检查 / 测试命令

    pnpm check        # tsc --noEmit      pnpm lint      # ESLint
    pnpm build        # Vite + tsc

| 命令                                             | 说明                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| pnpm test / test:unit                            | 全部 / 单元（mocks 无 DB）                             |
| test:integration / test:contract / test:property | testcontainers / OpenAPI 契约 ≥95% / fast-check        |
| test:chaos / test:docker                         | 混沌（需 Docker）/ 全量 Vitest（RUN_TESTCONTAINERS=1） |
| test:e2e:ui                                      | Playwright E2E                                         |

覆盖率门控: lines/functions ≥ 80%, branches ≥ 70%（scripts/check-coverage.mjs）。

## 5. Docker 与端口

    docker compose up -d             # 全栈
    docker compose -f docker-compose.chaos.yml up -d   # chaos 测试栈

端口与拓扑见 [ARCHITECTURE.md §4](../ARCHITECTURE.md#4-服务与端口)。

## 6. 已知坑点

| 前端                            | 后端                          | Go 引擎                                    | 数据库                               |
| ------------------------------- | ----------------------------- | ------------------------------------------ | ------------------------------------ |
| 遗留 slice 死代码未清理         | API Key 路径 /api/v1/keys     | withComputeHandler 统一计算端点            | audit_logs 链式 hash（HMAC）         |
| CSV 导出多处重复实现            | services/ 已迁入 application/ | PowerShell BOM 用 WriteAllText(UTF8,无BOM) | RLS 不启用: 市场/审计/outbox         |
| react-router-dom v7 兼容性      | Worker 独立进程               | 降级: data-fetcher 有 degraded, 引擎无     | FORCE RLS: backtest_app 无 BYPASSRLS |
| authStore 不持久化              | Stripe Webhook 无 jwtAuth     | 引擎不可用 503 非 200+degraded             | PgBouncer 必须 SET LOCAL             |
| Module Federation 预留(ADR-050) | opossum + gobreaker           |                                            | Redis: 认证 fail-closed, 缓存跳过    |
