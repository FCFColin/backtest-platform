# 运维指南（前端 + 运行命令 + 已知坑点）

## 1. 前端概览

目录: `pages/`（BacktestPage, AnalysisPage 等）、`components/`、`store/`（Zustand 无 persist）、`utils/`、`hooks/`、`i18n/`、`styles/`。

路由: `/` (BacktestPage), /analysis, /monte-carlo, /optimizer, /efficient-frontier, /factor-regression, /calculators, /data-engine, /billing, /login, /signup, /account。

技术栈: apiClient（Bearer + 401 自动刷新）、ECharts、Tailwind 3、Playwright E2E。

## 2. 前置要求与开发

前置要求与启动命令见 [README 快速启动](../../README.md#快速启动)；服务端口表见 [ARCHITECTURE §4](../ARCHITECTURE.md)。

## 3. 环境变量速查

| 类别              | 关键变量                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础 / Go 引擎    | NODE_ENV, API_PORT(15001), VITE_PORT(15173) / GO_ENGINE_URL(:15004), GO_DATA_SERVICE_URL(:15003), ENGINE_AUTH_TOKEN, DATA_SERVICE_AUTH_TOKEN |
| CORS / 数据库     | CORS_ORIGINS（生产必填；开发 true 允许全部）/ DATABASE_URL, DATABASE_READ_URL                                                                |
| Redis / 认证      | REDIS_URL, REDIS_SENTINELS / JWT_SECRET, JWT_ALGORITHM(RS256 用 *_KEY_FILE), DEV_SKIP_AUTH                                                   |
| 可观测性 / Stripe | OTEL_EXPORTER_OTLP_ENDPOINT / STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                                                                       |

## 4. 检查 / 测试命令

    pnpm check        # tsc --noEmit      pnpm lint      # ESLint
    pnpm build        # Vite + tsc

| 命令                                             | 说明                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| pnpm test / test:unit                            | 全部 / 单元（mocks 无 DB）                                           |
| test:integration / test:contract / test:property | testcontainers / OpenAPI 契约 ≥60% 双向 + 错误响应 ≥70% / fast-check |
| test:chaos / test:docker                         | 混沌（需 Docker）/ 全量 Vitest（RUN_TESTCONTAINERS=1）               |
| test:e2e:ui                                      | Playwright E2E                                                       |

覆盖率门控: lines/functions/statements/branches ≥ 80%（scripts/check-coverage.mjs）。

## 5. Docker 与端口

    docker compose up -d             # 全栈
    pnpm test:chaos                  # 混沌测试（需先 docker compose up -d）

端口与拓扑见 [ARCHITECTURE.md §4](../ARCHITECTURE.md#4-服务与端口)。

## 6. 已知坑点

| 前端                         | 后端                          | Go 引擎                                    | 数据库                               |
| ---------------------------- | ----------------------------- | ------------------------------------------ | ------------------------------------ |
|                              | API Key 路径 /api/v1/keys     | withComputeHandler 统一计算端点            | audit_logs 链式 hash（HMAC）         |
|                              | services/ 已迁入 application/ | PowerShell BOM 用 WriteAllText(UTF8,无BOM) | RLS 不启用: 市场/outbox              |
| react-router v8 单包(无 dom) | Worker 独立进程               | 降级: data-fetcher 有 degraded, 引擎无     | FORCE RLS: backtest_app 无 BYPASSRLS |
| authStore 不持久化           | Stripe Webhook 无 jwtAuth     | 引擎不可用 503 非 200+degraded             | 最小权限 backtest_app（无 CREATE）   |
|                              | opossum + gobreaker           |                                            | Redis: 认证 fail-closed, 缓存跳过    |
