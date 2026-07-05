# 回测平台全面自检报告

> **生成时间**: 2026-07-02
> **执行方式**: 自动化工具 + 结构化分析
> **基线**: TypeScript 0 类型错误 · ESLint 0 错误/0 警告(22 条被 eslint-disable 压制) · npm audit 0 高危漏洞
> **Git**: 分支 `refactor/core-restructuring` · 12 commits · 5 已修改文件 + 5 未跟踪目录

---

## 自检摘要

| 维度              | 严重发现 | 中低发现 | 整体评分          |
| ----------------- | -------- | -------- | ----------------- |
| 1. 代码质量与风格 | 1        | 6        | ⚠️ 良好但有技术债 |
| 2. 架构一致性     | 2        | 3        | ✅ 优秀           |
| 3. 测试质量       | 1        | 4        | ⚠️ 良好           |
| 4. 安全性         | 1        | 4        | ✅ 优秀           |
| 5. 性能           | 1        | 3        | ⚠️ 良好           |
| 6. 依赖与供应链   | 0        | 4        | ✅ 优秀           |
| 7. 文档完整性     | 1        | 3        | ✅ 优秀           |
| 8. 可观测性       | 0        | 2        | ✅ 优秀           |
| 9. 数据库与迁移   | 0        | 2        | ✅ 优秀           |
| 10. 配置与构建    | 1        | 2        | ✅ 良好           |

**总计**: Critical 0 · High 8 · Medium 33 · Low 4

---

## 维度一：代码质量与风格 (Code Quality & Style)

### 自动化工具结果

| 工具                  | 结果                                                                      | 状态 |
| --------------------- | ------------------------------------------------------------------------- | ---- |
| `tsc --noEmit`        | 0 错误                                                                    | ✅   |
| `eslint .`            | 0 错误, 0 警告 (22 条被 `eslint-disable` 压制)                            | ✅   |
| `prettier --check .`  | 53 文件格式不一致, 1 文件语法错误 (scripts/i18n-fix.mjs)                  | ⚠️   |
| `knip --no-exit-code` | 12 未使用文件, 6 未使用依赖, 29 未使用导出, 86 未使用导出类型, 3 重复导出 | ⚠️   |
| `npm audit`           | 0 漏洞                                                                    | ✅   |

### ESLint 压制分析

22 条 `eslint-disable` 压制全部有中文注释说明理由：

| 规则                                 | 数量 | 分布                                                  |
| ------------------------------------ | ---- | ----------------------------------------------------- |
| `@typescript-eslint/no-explicit-any` | 19   | tests/unit/store/backtest-store.test.ts               |
| `react-hooks/exhaustive-deps`        | 3    | WeightInput.tsx, BacktestPage.tsx, DataEnginePage.tsx |

### 大文件审查 (Top 15)

| 文件                                  | 行数 | 风险                                      |
| ------------------------------------- | ---- | ----------------------------------------- |
| `api/middleware/jwtAuth.ts`           | 1242 | 🔴 CRITICAL - JWT/RBAC/API-Key 混在单文件 |
| `src/pages/TacticalPage.tsx`          | 1161 | 🔴 页面组件过大                           |
| `api/engine/portfolio.ts`             | 1072 | 🔴 引擎逻辑混合                           |
| `src/pages/EfficientFrontierPage.tsx` | 1070 | 🔴 页面组件过大                           |
| `src/pages/AnalysisPage.tsx`          | 1048 | 🔴 页面组件过大                           |
| `src/pages/CalculatorsPage.tsx`       | 940  | 🔴 页面组件过大                           |
| `src/components/PortfolioEditor.tsx`  | 844  | ⚠️ 组件过大                               |
| `src/pages/TacticalGridPage.tsx`      | 769  | ⚠️ 页面组件过大                           |
| `src/pages/MonteCarloPage.tsx`        | 747  | ⚠️ 页面组件过大                           |
| `api/app.ts`                          | 736  | ⚠️ 路由配置 + 中间件编排                  |
| `src/pages/GoalOptimizerPage.tsx`     | 705  | ⚠️ 页面组件过大                           |
| `api/services/dataService.ts`         | 680  | ⚠️ 数据服务混合职责                       |
| `src/pages/FactorRegressionPage.tsx`  | 671  | ⚠️ 页面组件过大                           |
| `api/engine/optimizer.ts`             | 631  | ⚠️ 引擎逻辑混合                           |
| `src/components/ParameterPanel.tsx`   | 606  | ⚠️ 组件过大                               |

### tsconfig 编译器选项

```
strict: true
noUnusedLocals: false     ← 已放宽，未使用变量不会报错
noUnusedParameters: false ← 已放宽，未使用参数不会报错
noFallthroughCasesInSwitch: false
```

### Knip 死代码发现

**未使用文件 (12)**:

- `api/index.ts` - 似乎是导出入口
- `scripts/check-api-coverage.mjs`, `scripts/i18n-fix.mjs`, `scripts/i18n-replace.mjs`, `scripts/parse-eslint.mjs` - 一次性工具脚本
- `scripts/load/load-stages.js`, `scripts/load/measure-baseline.mjs`, `scripts/load/smoke.js` - 负载测试脚本
- `api/application/cqrs.ts` - 空的 barrel export？
- `src/components/EmptyState.tsx` - 定义了但未使用
- `src/store/index.ts` - 空的 barrel export
- `tests/benchmark/statistics.bench.ts` - 基准测试（可能按需运行）

**未使用导出 (29 个)** 包括 `NETWORK_NAME`, `hashPassword`, `hasPermission`, `getRolePermissions`, `setupGracefulShutdown` 等

**重复导出 (3 组)**:

- `makeLinearPriceData` / `makePriceData` (测试 fixtures)
- `config` / `default` (api/config/index.ts)
- `Footer` / `default` (src/components/layout/Footer.tsx)

---

## 维度二：架构一致性 (Architecture)

### DDD 层级与模块边界

| 检查项                              | 结果   | 状态 |
| ----------------------------------- | ------ | ---- |
| domain/ 不依赖 services/ 或 routes/ | 已确认 | ✅   |
| application/ 只依赖 domain/         | 已确认 | ✅   |
| shared/types 正确消费               | 已确认 | ✅   |
| 前端不直接 import 后端内部模块      | 已确认 | ✅   |

### 路由/中间件编排

- 20 条路由按 V1 版本模式组织，所有 `/api/v1/` 路由一致性很好
- 计算端点统一使用 `computeAuth + resolveTenant + computePermission + computeQuota + auditLog` 中间件链
- RBAC 权限体系清晰：
  - `BACKTEST_RUN` → 回测/分析/前沿/MC/LETF/PCA
  - `OPTIMIZER_RUN` → 优化器
  - `STRATEGY_MANAGE` → 战术/战术网格/目标优化器
  - `SIGNAL_READ` → 信号分析器
  - `ADMIN_ACCESS` → 管理接口
  - `DATA_READ` + `DATA_MANAGE` → 数据管理

### 降级模式 (ADR-031)

| 检查项                                  | 结果                                  | 状态              |
| --------------------------------------- | ------------------------------------- | ----------------- |
| Go 引擎 fail-closed (503 + Retry-After) | opossum 熔断器在 engineClient.ts 实现 | ✅                |
| 数据降级 `degraded: true`               | dataService.ts 有 PG 熔断器           | ⚠️ 需确认前端消费 |
| 前端降级展示                            | 未发现显式 degraded 检查              | ❓ 待确认         |

### API 版本化

| 检查项                              | 结果                                                     | 状态 |
| ----------------------------------- | -------------------------------------------------------- | ---- |
| 所有路由挂载 `/api/v1/` 前缀        | 是 (20 条路由)                                           | ✅   |
| `/api/` 旧路径 + Deprecation header | `deprecateRoute()` 函数实现                              | ✅   |
| 所有 `/api/` 旧路径覆盖             | **缺少:** keys, portfolios, configs, runs, orgs, billing | ⚠️   |
| Sunset 日期配置                     | 动态计算 (6个月后)                                       | ✅   |

---

## 维度三：测试质量 (Test Quality)

### 整体覆盖

| 指标       | 数值                                                   |
| ---------- | ------------------------------------------------------ |
| 测试框架   | Vitest + Playwright                                    |
| 测试文件数 | 141 test + 7 spec                                      |
| 测试总数   | 2441 (coverage commit 声明)                            |
| 覆盖率目标 | Lines 95%, Functions 95%, Branches 85%, Statements 95% |

### Go 测试

| 模块                          | 测试结果         |
| ----------------------------- | ---------------- |
| engine-go/internal/engine     | ✅ PASS (0.742s) |
| engine-go/internal/middleware | ✅ PASS (2.292s) |
| engine-go/internal/montecarlo | ✅ PASS (0.733s) |
| engine-go/internal/optimizer  | ✅ PASS (0.966s) |
| data-fetcher                  | ✅ PASS (5.797s) |
| data-fetcher/baostock         | ✅ PASS (0.490s) |

**缺口**: 多项 Go 内部包无测试文件：

- engine-go: `analysis`, `observability`, `server`
- data-fetcher: `akshare`, `finnhub`, `httpclient`, `observability`, `provider`, `twelvedata`, `yfinance`, 以及 `cmd/worker`

### 测试分布

| 测试类别     | 文件数  | 覆盖度                                                             |
| ------------ | ------- | ------------------------------------------------------------------ |
| unit/        | ~126    | 覆盖所有模块 (routes, services, middleware, engine, domain, etc.)  |
| integration/ | 4       | API, security, DB, pages                                           |
| e2e/ui/      | 7 specs | Playwright (backtest, analysis, optimizer, data-engine, i18n, nav) |
| chaos/       | 4       | DB disconnect, external delay, concurrent restart, Redis outage    |
| consistency/ | 1       | Go ↔ JS engine                                                     |
| contract/    | 1       | OpenAPI                                                            |
| fuzz/        | 1       | Bug hunt                                                           |
| benchmark/   | 1       | Statistics                                                         |

### 缺口分析

- Go data-fetcher 的大量 provider 模块无测试（6 个内部包：0 测试文件）
- 无端到端测试覆盖认证流程、计费流程
- 无安全专项测试（XSS/注入/CSRF）
- 路由元组（/api/ 旧路径）无测试覆盖 Deprecation header 行为

---

## 维度四：安全性 (Security)

### 认证与授权

| 检查项                 | 结果                                   | 状态 |
| ---------------------- | -------------------------------------- | ---- |
| JWT 算法 (jose)        | RSA + RS256, 支持 HS256 回退           | ✅   |
| Refresh Token 轮换     | Reuse Detection (Token Family)         | ✅   |
| RBAC (3 角色 × 7 权限) | 完整实现                               | ✅   |
| API Key (x-api-key)    | 哈希存储 (sha256), 可吊销              | ✅   |
| 路由认证覆盖           | 所有计算端点有 jwtAuth/optionalJwtAuth | ✅   |
| x-api-key 日志泄露     | 未发现泄露 (已哈希)                    | ✅   |

### 输入验证

| 检查项          | 结果                                  | 状态          |
| --------------- | ------------------------------------- | ------------- |
| Zod schema 覆盖 | 所有 POST/PUT/PATCH 路由有 Zod schema | ✅            |
| URL 参数验证    | GET 路由参数有 Zod 验证或简单校验     | ⚠️ 部分未覆盖 |
| 请求体大小限制  | `json({ limit: '10mb' })`             | ⚠️ 较大上限   |

### CORS & HTTP 安全

| 检查项                | 结果                                              | 状态 |
| --------------------- | ------------------------------------------------- | ---- |
| helmet 配置           | 已启用                                            | ✅   |
| CORS_ORIGINS 生产警告 | 配置在 production 有检查 (通配时打印警告)         | ✅   |
| rate limiting         | 计算端点 10 req/min, 管理 30/min, 登录 10/15min   | ✅   |
| 登录端点 fail-closed  | passOnStoreError: false, Redis 抖动时拒绝而非放行 | ✅   |

### 数据泄露检查

| 检查项               | 结果                           | 状态        |
| -------------------- | ------------------------------ | ----------- |
| 密码/token/log 泄露  | 日志中使用 `hashUserId()` 脱敏 | ✅          |
| 404 响应不反射路径   | 显式防止 XSS 反射 (注释 T-28)  | ✅          |
| 开发环境错误详情显示 | 生产隐藏, 开发暴露 (安全权衡)  | ⚠️ 符合预期 |

---

## 维度五：性能 (Performance)

### 数据库

| 检查项   | 结果                                                                | 状态 |
| -------- | ------------------------------------------------------------------- | ---- |
| N+1 查询 | services/ 层未发现循环内查询模式                                    | ✅   |
| 分页     | dataRoutes 的 GET /tickers 有 LIMIT 500, 但其他 list 端点未发现分页 | ⚠️   |
| 连接池   | pg 连接池 (config DB_POOL_MAX/MIN)                                  | ✅   |
| 索引     | 迁移中有合理索引 (idx_*, WHERE partial indexes)                     | ✅   |

### 前端

| 检查项                | 结果                                                | 状态          |
| --------------------- | --------------------------------------------------- | ------------- |
| 懒加载                | BacktestPage.tsx 使用 React.lazy 加载 18 个图表组件 | ✅            |
| 其余页面              | 所有其他 pages 组件的懒加载缺失                     | ⚠️            |
| Zustand selector 粒度 | 检查 store 使用, 部分组件订阅过多                   | ⚠️ 待基准测试 |

### Go 引擎

| 检查项           | 结果                                                    | 状态 |
| ---------------- | ------------------------------------------------------- | ---- |
| 熔断器 (opossum) | engineClient.ts 已实现 (50% error threshold, 30s reset) | ✅   |
| 并发限制         | 未发现 goServiceSemaphore 在生产环境配置                | ⚠️   |
| 超时配置         | ENGINE_TIMEOUT_MS 默认 5000ms, 引擎熔断器可配置         | ✅   |

---

## 维度六：依赖与供应链 (Dependencies & Supply Chain)

### Node.js

| 检查项                 | 结果                                                                           | 状态 |
| ---------------------- | ------------------------------------------------------------------------------ | ---- |
| npm audit (high+)      | 0 个                                                                           | ✅   |
| License 检查           | 配置 (MIT/ISC/Apache/BSD)                                                      | ✅   |
| 未使用依赖             | `pg-copy-streams`, `pino-pretty`                                               | ⚠️   |
| 未使用 devDependencies | 4 个 (lint-staged, @napi-rs/cli, @vercel/node, babel-plugin-react-dev-locator) | ⚠️   |
| 未列明依赖             | `@opentelemetry/sdk-metrics`                                                   | ⚠️   |
| 未列明二进制           | `jscpd`, `license-checker`, `husky`                                            | ⚠️   |

### Go

| 检查项            | 结果                                        | 状态        |
| ----------------- | ------------------------------------------- | ----------- |
| engine-go 测试    | 4 包测试全部 PASS                           | ✅          |
| data-fetcher 测试 | 2 包测试全部 PASS                           | ✅          |
| Go 版本差异       | engine-go: Go 1.25, data-fetcher: Go 1.26.4 | ⚠️ 建议统一 |

---

## 维度七：文档完整性 (Documentation)

### ADR

| 检查项         | 结果                                                                             | 状态 |
| -------------- | -------------------------------------------------------------------------------- | ---- |
| ADR 完整性     | 37 份 ADR (ADR-001 至 ADR-037) 全部存在                                          | ✅   |
| ADR 编号连续性 | 无编号跳跃                                                                       | ✅   |
| 代码决策一致性 | 抽样检查 ADR-016(断路器), ADR-017(JWT), ADR-031(单引擎), ADR-032(RLS) 与代码一致 | ✅   |

### API 文档

| 检查项               | 结果              | 状态                                               |
| -------------------- | ----------------- | -------------------------------------------------- |
| OpenAPI 规范存在     | docs/openapi.yaml | ✅                                                 |
| OpenAPI 覆盖 v1 端点 | 已验证核心端点    | ⚠️ 可能不包含新路由 (keys/portfolios/configs/runs) |

### 代码注释

| 检查项                  | 结果                              | 状态 |
| ----------------------- | --------------------------------- | ---- |
| 导出函数 JSDoc          | app.ts 路由配置有高质量中英文文档 | ✅   |
| shared/types 接口 JSDoc | 部分有, 非全部                    | ⚠️   |
| 冗余注释检查            | 大部分注释是"为什么"而非"是什么"  | ✅   |

---

## 维度八：可观测性 (Observability)

### 日志

| 检查项        | 结果                                 | 状态 |
| ------------- | ------------------------------------ | ---- |
| pino 日志框架 | 已配置 (api/utils/logger.ts)         | ✅   |
| 审计日志      | 路由编排中有 `auditLog` 中间件       | ✅   |
| 敏感数据脱敏  | `hashUserId()` 在 jwtAuth 日志中使用 | ✅   |

### 指标

| 检查项                 | 结果                                                        | 状态 |
| ---------------------- | ----------------------------------------------------------- | ---- |
| prom-client 自定义指标 | backtestRequestsTotal, degradedResponsesTotal, pgPool* 等   | ✅   |
| 熔断器指标             | registerCircuitBreakerMetrics 在 engineClient + dataService | ✅   |
| Go 端 Prometheus       | engine-go 内部 observability 包                             | ✅   |

### 链路追踪

| 检查项             | 结果                             | 状态 |
| ------------------ | -------------------------------- | ---- |
| OpenTelemetry 注入 | api/tracing.ts 配置              | ✅   |
| Go OTel 集成       | data-fetcher 有 observability 包 | ✅   |
| Trace 传播         | Node ↔ Go trace header 传递      | ✅   |

---

## 维度九：数据库与迁移 (Database & Migrations)

### 迁移质量

| 检查项         | 结果                                        | 状态 |
| -------------- | ------------------------------------------- | ---- |
| 迁移文件完整性 | 12 版本, 每版本有 up + down                 | ✅   |
| 迁移顺序       | 合理 (001 init → 012 usage)                 | ✅   |
| 回滚可用性     | 所有 down.sql 存在 (除 004_down 近乎空文件) | ✅   |
| 破坏性操作审计 | 无可逆的 DROP/ALTER 操作                    | ✅   |

### Schema 与安全

| 检查项                       | 结果                                       | 状态 |
| ---------------------------- | ------------------------------------------ | ---- |
| Row Level Security (ADR-032) | 3 张租户表启用 + FORCE RLS                 | ✅   |
| RLS 策略                     | `current_setting('app.current_tenant_id')` | ✅   |
| 最小权限角色 (007)           | `NOBYPASSRLS`, 显式 GRANT DML              | ✅   |
| 身份表无 RLS                 | 设计合理 (说明清晰)                        | ✅   |
| 外键约束                     | 全部迁移中有 REFERENCES                    | ✅   |

### 数据完整性

| 检查项        | 结果                                     | 状态 |
| ------------- | ---------------------------------------- | ---- |
| 唯一约束      | 各表 ID PK, slug UNIQUE, key_hash UNIQUE | ✅   |
| NOT NULL 约束 | 必要字段均 NOT NULL                      | ✅   |
| CHECK 约束    | plan, status, role 等有 CHECK            | ✅   |

---

## 维度十：配置与构建 (Configuration & Build)

### 环境配置

| 检查项                | 结果                                                        | 状态 |
| --------------------- | ----------------------------------------------------------- | ---- |
| `.env.example` 完整性 | 46 个变量, 所有配中文注释                                   | ✅   |
| `process.env` 一致性  | 实际使用 45 个变量, `.env.example` 基本覆盖                 | ✅   |
| 生产安全默认值        | `CORS_ORIGINS` 通配有警告; `REQUIRE_API_KEY` 生产检查       | ✅   |
| 生产校验              | adminRoutes 有 `validateConfig()` (检查 API_KEY, CORS, JWT) | ✅   |

### 构建

| 检查项            | 结果                                     | 状态 |
| ----------------- | ---------------------------------------- | ---- |
| tsc 构建 (tsc -b) | 无错误                                   | ✅   |
| Vite 构建         | 已配置 (manual chunks, lazy loading)     | ✅   |
| Docker 多阶段构建 | Dockerfile + Dockerfile.distroless       | ✅   |
| CI 缓存           | workflows/ci.yml 有 npm + Go module 缓存 | ✅   |

### k8s 部署

| 检查项         | 结果                 | 状态 |
| -------------- | -------------------- | ---- |
| HPA 配置       | k8s/ 有 HPA manifest | ✅   |
| PDB            | 已配置               | ✅   |
| ConfigMap      | 无硬编码敏感信息     | ✅   |
| Otel Collector | 已配置               | ✅   |

---

## 重点关注清单 (Priority Order)

### High 优先级

1. **大文件技术债** - 7 个文件 > 800 行，其中 `jwtAuth.ts` (1242行) 应拆分 JWT/RBAC/API-Key 逻辑；`TacticalPage.tsx` 等前端大页面应拆分子组件
2. **老旧 `/api/` 路由覆盖不全** - `/api/keys`, `/api/portfolios`, `/api/configs`, `/api/runs`, `/api/orgs`, `/api/billing` 没有对应的 Deprecation header 版本
3. **数据-fetcher Go 提供商代码未跟踪** - 5 个目录 (`finnhub/`, `httpclient/`, `provider/`, `twelvedata/`, `data/`) 未 git 跟踪，表明重构未完成
4. **Go 提供商模块 0 测试覆盖** - 6 个内部包 (`akshare`, `finnhub`, `httpclient`, `observability`, `provider`, `twelvedata`, `yfinance`) 无测试文件
5. **API list 端点无分页** - 多个 GET 路由返回未分页的数据列表
6. **前端懒加载不足** - 除 BacktestPage 外，所有大页面 (11 个 > 500 行) 未使用 React.lazy 代码分割
7. **Knip 大量死代码** - 12 未使用文件, 29 未使用导出, 86 未使用类型
8. **生产 CORS 通配风险** - .env.example 默认 `CORS_ORIGINS=` 为空（开发友好），需强调生产配置警告

### Medium 优先级

9. `scripts/i18n-fix.mjs` 语法错误 (unterminated string constant)
10. `noUnusedLocals: false`, `noUnusedParameters: false` 编译器检查放松
11. 6 个未使用/未注册的依赖
12. ESLint 22 条 `eslint-disable` 压制需长期评审
13. Go 版本不一致 (1.25 vs 1.26.4)
14. 前端 degrade 展示未在组件中显式处理
15. `prettier --check` 53 文件格式不一致

---

## 附件说明

本报告基于以下自动工具输出生成：

- `npm run check` / `tsc --noEmit`
- `npm run lint` / `eslint --format json`
- `npm run format:check` / `prettier --check`
- `npm run deadcode` / `knip --no-exit-code`
- `npm run audit:supply` / `npm audit`
- `go test ./...` (engine-go + data-fetcher)
- 结构化源文件分析 (grep, Select-String, 行数统计)
- `git status` / `git log`

**该报告仅用于自检分析，不涉及任何代码修改。**
