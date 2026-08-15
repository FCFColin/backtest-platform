# 运维指南（前端 + 运行命令 + 已知坑点）

## 1. 前端概览

目录: `pages/`（BacktestPage, AnalysisPage 等）、`components/`、`store/`（Zustand 无 persist）、`utils/`、`hooks/`、`i18n/`、`styles/`。

路由: `/` (BacktestPage), /analysis, /monte-carlo, /optimizer, /efficient-frontier, /factor-regression, /calculators, /data-engine, /billing, /login, /signup, /account。

技术栈: apiClient（Bearer + 401 自动刷新）、ECharts、Tailwind 3、Playwright E2E。

## 2. 前置要求与开发

前置要求与启动命令见 [README 快速启动](../../README.md#快速启动)；docker compose 与混沌测试见 `package.json` scripts；端口与拓扑见 [ARCHITECTURE §4](../ARCHITECTURE.md#4-服务与端口)。

## 3. 环境变量速查

环境变量定义以 `.env.example` 为权威源。

## 4. 检查 / 测试命令

检查与各层测试命令以 `package.json` scripts 为权威源（`check` / `lint` / `test:*` / `verify:critical`）；覆盖率门控见 `scripts/check-coverage.mjs`（lines/functions/statements/branches ≥ 80%）。

## 5. 已知坑点

| 前端                         | 后端                          | Go 引擎                                    | 数据库                               |
| ---------------------------- | ----------------------------- | ------------------------------------------ | ------------------------------------ |
|                              | API Key 路径 /api/v1/keys     | withComputeHandler 统一计算端点            | audit_logs 链式 hash（HMAC）         |
|                              | services/ 已迁入 application/ | PowerShell BOM 用 WriteAllText(UTF8,无BOM) | RLS 不启用: 市场/outbox              |
| react-router v8 单包(无 dom) | Worker 独立进程               | 降级: data-fetcher 有 degraded, 引擎无     | FORCE RLS: backtest_app 无 BYPASSRLS |
| authStore 不持久化           | Stripe Webhook 无 jwtAuth     | 引擎不可用 503 非 200+degraded             | 最小权限 backtest_app（无 CREATE）   |
|                              | opossum + gobreaker           |                                            | Redis: 认证 fail-closed, 缓存跳过    |
