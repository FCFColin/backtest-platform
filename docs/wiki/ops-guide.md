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

仅收录未在 deep-dive/ARCHITECTURE 重复的独有注意项：

- **前端**：react-router v8 单包（无 dom 分包）；authStore 不持久化（刷新需重登/重取）
- **后端**：Worker 独立进程；Stripe Webhook 独立挂载（无 jwtAuth，签名验证）
- **Go 引擎**：withComputeHandler 统一计算端点；PowerShell 写文件用 `WriteAllText(UTF8, 无BOM)` 防 BOM 头解析异常
- **数据库**：RLS 不启用市场/outbox 表；backtest_app 无 BYPASSRLS（FORCE RLS 生效）；最小权限（无 CREATE）
