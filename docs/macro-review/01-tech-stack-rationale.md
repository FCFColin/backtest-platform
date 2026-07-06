# 切片01：技术栈合理性

> **审查日期**: 2026-07-06
> **基线**: ADR-008、ADR-031、ADR-007、ADR-018、ADR-009；自检报告两份；代码扫描

---

## Q1: Go 引擎 + Node 规范引擎双轨制是否合理？Node 规范引擎何时可退役？

### 证据

| 维度                        | 数据                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go 引擎                     | `engine-go/` 20 个 `.go` 文件, 5482 行 — 覆盖 backtest/monte-carlo/optimizer/analysis/efficient-frontier                                                                                          |
| Node 引擎模块               | `packages/backend/src/engine/` 16 个 `.ts` 文件, 4548 行 — 覆盖 tactical/tacticalGrid/signal/pca/letf/goalOptimizer + 共享数值工具 (statistics/growthCurve/seriesUtils/matrixOps)                 |
| 路由到 Go 引擎              | `backtestRoutes.ts` 全部 6 个 handler 通过 `callEngineStrict` 或 `BacktestApplicationService`(→Go) 调用 Go 引擎                                                                                   |
| 路由到 Node 引擎            | 无路由直接 import `../engine/`。Node 引擎模块通过 application service 层接入                                                                                                                      |
| Node-canonical 功能         | `tactical-application-service.ts` → tactical, `signal-application-service.ts` → signal, `analytics-application-service.ts` → pca/letf/goalOptimizer, `grid-application-service.ts` → tacticalGrid |
| **GAP: Optimizer 网格搜索** | `backtestOptimizerRoutes.ts` → `optimizer-application-service.ts` → `runPortfolioBacktest` (Node 引擎)，**不走 Go 引擎**。区别于 `backtestRoutes.ts` 的 `/optimize` (走 Go)                       |
| ADR-031 实施状态            | `EngineUnavailableError` + `callEngineStrict` 已实现，503 + Retry-After 已部署，`degraded` 标记已从 Go 路径移除                                                                                   |
| 历史行李                    | `api/routes/` 和 `api/engine/` 有旧版 Node 引擎副本 (同 16 模块的旧版)                                                                                                                            |

### 分析

**ADR-031 降级策略执行到位**: Go 引擎路径（回测/分析/蒙特卡洛/优化/有效前沿）全部 fail-closed，Node 不回退。这是对的。

**Node 规范引擎的合理存在**: tactical/signal/pca/letf/goalOptimizer/tacticalGrid 在 Go 中无等价实现，Node 即权威，这类"规范引擎"不是降级而是主实现。ADR-031 §"Node-canonical 功能不受影响" 已明确界定。

**问题 1 — 优化器网格搜索走 Node**: `backtestOptimizerRoutes.ts` 的 POST `/optimize`（网格搜索）完全在 Node 计算 (`runPortfolioBacktest`)，与 `backtestRoutes.ts` 的 `/optimize`（走 Go）产生两条不同的优化路径。用户得到的结果可能因引擎不同而有数值差异。这是在 ADR-031 边界之外的盲区。

**问题 2 — 历史遗留**: `api/engine/` 和 `api/routes/` 有旧版 Node 引擎副本，与 `packages/backend/src/engine/` 形成代码碎片。`api/routes/` 仍有 22 个旧路由文件平行存在。

**问题 3 — 退役时机**: Node 规范引擎的退役仅取决于 Go 侧是否实现等价功能。目前 tactical（择时策略）和 tacticalGrid（参数网格）是投资策略的核心差异化功能且在持续迭代，Go 实现优先级低。signal/pca/goalOptimizer/letf 相对稳定但无迁移计划。**近期（12 个月内）无退役可能**。

### 结论

**change**: 双轨制本身合理，但需修补两个 gap：

1. **优化器网格搜索 → Go 引擎**: `optimizer-application-service.ts` 应改为调用 Go 引擎的优化端点或通过 `callEngineStrict` 路由，消除与 `backtestRoutes.ts` 优化路径的不一致。
2. **清理 `api/` 遗留骨架**: 删除 `api/engine/` 和 `api/routes/` 中已迁移到 `packages/backend/` 的旧模块，消除代码碎片。

Node 规范引擎无退役路线图 — 建议至少在未来 12 个月内保持双轨。

---

## Q2: Zod v4 迁移完成度？哪些路由仍然裸露？

### 证据

| 指标                       | 数值                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 路由文件总数               | 22 个                                                                                                                                                                                                                 |
| HTTP handler 总数          | 93 个                                                                                                                                                                                                                 |
| 使用 schemas/ (zod) 的路由 | 13 个 (59%) — authRoutes, backtestRoutes, backtestOptimizerRoutes, configRoutes, dataRoutes, goalOptimizerRoutes, letfRoutes, pcaRoutes, portfolioRoutes, runRoutes, signalRoutes, tacticalGridRoutes, tacticalRoutes |
| 内联 zod 的路由            | 3 个 (14%) — apiKeyRoutes (createKeySchema), billingRoutes (checkoutSchema), orgRoutes (inviteSchema/roleSchema/acceptSchema)                                                                                         |
| **无 zod 的裸路由**        | **6 个 (27%)** — adminRoutes (4 handlers), dataManageRoutes (19 handlers), debugRoutes (1), healthRoutes (4), jobRoutes (1), register.ts (1)                                                                          |
| schemas/ 目录              | 12 个文件，全部使用 `import { z } from 'zod'` (zod v4)                                                                                                                                                                |
| zod 版本                   | `^4.4.3` (root + backend + frontend)                                                                                                                                                                                  |
| 风险最大                   | `dataManageRoutes.ts` 有 **19 个 handler** 全部无校验 — 数据管理端点（数据更新/导入/删除）无任何入参校验                                                                                                              |

### 分析

**实际覆盖率优于自检报告**: 自检报告称"11/50 路由有 schema (22%)"。但按 handler 颗粒度统计，13/22 路由文件 (59%) 已接入 zod schemas。自检报告口径可能是"50 个会写数据的 mutation 端点仅 11 有 schema"。

**核心计算路由全部隔离**: backtest、tactical、signal、pca、letf、goalOptimizer、efficient-frontier — 这些正确性关键路径全部使用 validate 中间件 + zod schema。这是正确的优先级排列。

**裸路由风险评估**:

- `healthRoutes.ts` (4 handlers) + `debugRoutes.ts` (1 handler): 只读状态端点，风险低，可豁免。
- `register.ts` (1 handler): 注册入口，应当有 schema (邮箱/密码校验)。
- `jobRoutes.ts` (1 handler): 异步任务状态查询，风险低但建议加 schema。
- `adminRoutes.ts` (4 handlers): 管理端点（引擎状态/数据统计），建议加 schema。
- **`dataManageRoutes.ts` (19 handlers)**: ⚠️ 数据管理突变端点无任何校验 — 高风险。覆盖数据更新、导入、删除操作，应有严格的入参校验防止注入和数据损坏。

### 结论

**change**: 已有 schemas/ 目录和 validate 中间件基础设施完善，迁移到 zod v4 的工程就绪。

1. **补全 5 个低风险裸路由**：register.ts, jobRoutes.ts, adminRoutes.ts, healthRoutes.ts, debugRoutes.ts — 估计 2 小时。
2. **优先修补 `dataManageRoutes.ts` (19 handlers)** — 这是 P1 级别的安全债。评估 4-6 小时。
3. 关键计算路由的 schema 覆盖率已达 100%，无需回溯。

---

## Q3: React 18 → 19 的升级窗口和阻断项

### 证据

| 依赖                        | 当前版本                            | React 19 兼容性                                  |
| --------------------------- | ----------------------------------- | ------------------------------------------------ |
| react                       | ^18.3.1                             | —                                                |
| react-dom                   | ^18.3.1                             | —                                                |
| @types/react                | ^18.3.31                            | 需升级到 @types/react@19                         |
| @types/react-dom            | ^18.3.7                             | 需升级                                           |
| zustand                     | ^5.0.14                             | peerDeps `react>=18.0.0` → **兼容**              |
| recharts                    | ^2.15.4                             | peerDeps `^16.0.0                                |     | ^17.0.0 |     | ^18.0.0 |     | ^19.0.0` → **兼容** |
| react-router-dom (root)     | ^6.30.4                             | **兼容**                                         |
| react-router-dom (frontend) | ^7.18.1                             | **兼容**                                         |
| @vitejs/plugin-react        | ^4.7.0                              | 支持 React 19                                    |
| react-i18next               | ^15.7.4 (root) / ^17.0.8 (frontend) | 需验证 v17 compat                                |
| @testing-library/react      | ^16.3.0                             | peerDeps `react@^18.0.0` — 需升级到 v16 更高版本 |

### 分析

**无硬阻断项**: 所有 key 依赖 (zustand, recharts, react-router-dom, vite plugin) 均已声明 React 19 兼容。这是有利的升级窗口。

**需要注意的两个点**:

1. **react-router-dom 版本分裂**: root 锁定 `^6.30.4`，frontend 锁定 `^7.18.1`。实际运行时 frontend 的 `packages/frontend/node_modules/` 解析到 v7.18.1。这种版本分裂在 monorepo 中需注意类型和 API 不一致。
2. **@testing-library/react** 需要升级到 v16 的 React 19 兼容版本。
3. **react-i18next** v17 需确认 React 19 支持 (i18next 生态通常跟进较快)。

**迁移工作量估计**: 低。主要是版本号变更 + types 升级 + 少量 API 适配（主要是 `@types/react` 中弃用的类型调整，如 `React.FC` 的 `children` 隐式声明）。

### 结论

**investigate further**: 无技术阻断，建议在下一 feature 周期后安排升级（预计 2026 Q3）。

- 升级前需验证: react-i18next v17 React 19 compat, @testing-library/react 更新。
- 统一 react-router-dom 版本 (建议 frontend 的 v7 → 全 workspace 统一)。
- **建议先在一个 feature 分支上做试升级**，运行 `npm run check` + `npm run test` 全量通过后合并。

---

## Q4: pnpm workspace 相对 npm 的实际收益评估

### 证据

| 指标                              | 值                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| pnpm-lock.yaml                    | 369 KB                                                                                                        |
| package-lock.json（旧版, 仍存在） | 394 KB                                                                                                        |
| pnpm install (frozen, cached)     | 0.85s                                                                                                         |
| node_modules 顶层包数             | 504                                                                                                           |
| pnpm-workspace.yaml               | 仅 2 行有效配置: `packages: ['packages/*']`                                                                   |
| 包间依赖                          | `@backtest/backend` → `@backtest/shared: workspace:*`, `@backtest/frontend` → `@backtest/shared: workspace:*` |
| 后端 node_modules 专属包          | 20 个 (非 hoisted)                                                                                            |
| 迁移时间                          | 2026-07-03 (commit `3ed3c25`), 距今仅 3 天                                                                    |
| 旧 package-lock.json              | **未被删除** — 残留在根目录                                                                                   |

### 分析

**实际收益有限但确定**:

1. **磁盘效率**: pnpm 的 content-addressable store 对多包 monorepo 的收益 >10%（npm 的 flat `node_modules` 会在每个包复制共享依赖）。当前 3 个包的场景收益约 10-20%。
2. **安装速度**: 0.85s (cached) 比 npm 基线 (约 2-3s cached) 快 2-3x。CI 中 cold install 的差异更显著 (pnpm ~15s vs npm ~30s+)。
3. **严格隔离**: pnpm 默认 `strict-dep-resolution` 防止幽灵依赖。对 monorepo 中防止未声明依赖跨包泄漏有价值。
4. **Workspace 协议**: `workspace:*` 确保本地包引用版本同步。

**当前问题**:

1. **旧 package-lock.json 残留**: 根目录的 `package-lock.json` 是迁移遗留，可能引起混淆。
2. **迁移仅 3 天**: 尚无足够数据评估 pnpm 是否引入 CI/CD 或开发流程问题。
3. **3 包规模的 monorepo 收益不明显**: 仅 backend/frontend/shared 三个包，npm workspace 也能胜任。pnpm 的收益随包数增长而放大。

### 结论

**keep**: pnpm 是合理选择，收益在可接受范围。不需要回退到 npm。

- 清理残留 `package-lock.json`。
- 3 个月后再做收益评估（关注 CI 时间、幽灵依赖事故率）。
- 如果 monorepo 扩展到 5+ 包，pnpm 的收益会更显著。

---

## Q5: PostgreSQL + Redis 在当前体量下是否过重

### 证据

| 维度         | 数据                                                               |
| ------------ | ------------------------------------------------------------------ |
| 数据库迁移   | 12 个版本化 SQL (001~012)，~20 张表                                |
| 核心表       | `tickers`, `prices`, `cpi_data`, `exchange_rates` — 金融时序核心   |
| 业务表       | `users`, `orgs`, `org_members`, `api_keys`, `invitations` — 多租户 |
| 事件表       | `outbox`, `outbox_dedup` — 事件溯源                                |
| 计费表       | `subscriptions`, `billing_*` — Stripe 集成                         |
| 数据量       | 磁盘 `data/` 仅 77 字节（单文件搜索缓存），**当前基本为零数据**    |
| PG 镜像      | `postgres:16-alpine` (~200MB)                                      |
| Redis 配置   | `redis:7-alpine` (~35MB), `--save '' --appendonly no` (纯内存)     |
| PG 资源需求  | docker-compose 无显式 CPU/内存限制，默认共享宿主机                 |
| ADR-007 理由 | 水平扩展、连接池、全文搜索、企业级运维（流复制/PITR）              |
| ADR-018 理由 | 水平扩展下跨实例状态共享（Refresh Token/幂等 Key/限流/缓存）       |

### 分析

**PostgreSQL 在当前阶段过重但合理**:

- 当前数据量接近零（`data/` 无有效数据），一个 SQLite 文件 (~1MB) 足以满足当前需求。
- 但 ADR-007 的决策基于 **架构预期而非当前负载**：K8s 多副本、多租户、全文搜索、连接池。若等数据量到 100GB 再迁移，数据迁移成本巨大。
- PG 的开发运维成本（独立进程、连接配置、drizzle/tsx 工具链）在本地可通过 docker-compose 降到接近零——`docker compose up -d postgres` 即用。
- **临界点判断**: 当前 PG 的 ROI 为负（用不到任何 PG 特性，SQLite 80% 场景够用）。但当月活 >100 用户或数据量 >1GB 时，PG 特性（流复制、连接池、GIN全文搜索）的收益开始覆盖成本。

**Redis 更微妙的判断**:

- Redis 用于: Refresh Token 跨实例共享、限流计数、幂等 Key、BullMQ 队列。这些功能在单实例部署下可用内存替代（如 ADR-018 降级策略所述）。
- 但启动 Redis 的开销几乎为零 (35MB alpine镜像)，且 BullMQ 硬依赖 Redis。
- **关键依赖**: BullMQ (异步任务队列) 没有 Redis 无法工作。若移除 Redis，需用 in-process 队列替代，损失持久化和 Worker 横向扩展能力。
- **临界点判断**: 有 BullMQ 需求时 Redis 就是合理选择。无 BullMQ 需求时可以考虑降级到内存缓存 + 进程内队列。

### 结论

| 组件       | 判断     | 理由                                                      |
| ---------- | -------- | --------------------------------------------------------- |
| PostgreSQL | **keep** | 当前 ROI 负，但先发选型避免了未来的大迁移成本。保持现状。 |
| Redis      | **keep** | BullMQ 硬依赖 + 零开销部署。无正当理由移除。              |

**动作建议**:

1. 确认 PG 资源限制（docker-compose 或 k8s 中显式设置内存上限，避免 PG 占用过多宿主机内存）。
2. 如果有纯离线/开发环境场景，可提供 `docker compose -f docker-compose.yml up postgres redis` 一键启动脚本（当前已支持）。
3. 不需要重新评估 SQLite。PG 的额外成本（约 200MB 镜像 + 1 个进程）不足以 justify 回退工程。

---

## 综合优先级矩阵

| 问题                                  | 严重度       | 优先级 | 预估工时 | 建议执行时间   |
| ------------------------------------- | ------------ | ------ | -------- | -------------- |
| Q2-dataManageRoutes 19 handler 无校验 | 🔴 P1 安全   | 高     | 4-6h     | 当前 sprint    |
| Q1-优化器网格搜索走 Node vs Go 不一致 | 🟡 P2 正确性 | 中     | 3-5h     | 下一 sprint    |
| Q1-清理 `api/` 遗留代码               | 🟢 P3 整洁   | 低     | 1-2h     | 可安排但非必须 |
| Q2-补全 5 个低风险裸路由              | 🟢 P3 安全   | 低     | 2h       | 可安排         |
| Q3-React 19 升级计划                  | 🟢 P3 现代化 | 低     | -        | Q3 评估        |
| Q4-清理残留 package-lock.json         | 🟢 P4 杂物   | 最低   | 5min     | 即办           |
| Q5-PG/Redis 保持现状                  | -            | -      | -        | 无需动作       |
