# 代码整理计划 (Code Simplification Plan)

> 基于 [Code Simplification](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md) 方法论制定。
> 核心原则：**保持行为完全不变**，只改善代码的可读性、可维护性和一致性。

---

## 一、现状摘要

### 量化指标

| 指标            | 数值 | 说明                                                             |
| --------------- | ---- | ---------------------------------------------------------------- |
| ESLint 警告     | 513  | 0 errors, 513 warnings                                           |
| TypeScript 错误 | 0    | 类型检查通过                                                     |
| 测试文件总数    | ~110 | unit + integration + e2e + chaos + fuzz + consistency + contract |
| 最大文件行数    | 1369 | `src/pages/BacktestPage.tsx`                                     |

### ESLint 警告分布

| 规则                                   | 数量 | 优先级 |
| -------------------------------------- | ---- | ------ |
| `@typescript-eslint/no-explicit-any`   | 284  | P1     |
| `max-lines-per-function`               | 86   | P2     |
| `complexity`                           | 45   | P2     |
| `sonarjs/cognitive-complexity`         | 43   | P2     |
| `@typescript-eslint/no-unused-vars`    | 32   | P1     |
| `max-params`                           | 8    | P3     |
| `max-depth`                            | 6    | P3     |
| `react-hooks/exhaustive-deps`          | 5    | P2     |
| `max-nested-callbacks`                 | 3    | P3     |
| `react-refresh/only-export-components` | 1    | P3     |

### 最大的文件（Top 10）

| 行数 | 文件                                        | 类型       |
| ---- | ------------------------------------------- | ---------- |
| 1369 | `src/pages/BacktestPage.tsx`                | 前端页面   |
| 1231 | `api/middleware/jwtAuth.ts`                 | 后端中间件 |
| 1201 | `tests/unit/middleware/jwtAuth.test.ts`     | 测试       |
| 1178 | `tests/unit/store/backtest-store.test.ts`   | 测试       |
| 1131 | `src/pages/AnalysisPage.tsx`                | 前端页面   |
| 973  | `src/pages/MonteCarloPage.tsx`              | 前端页面   |
| 903  | `api/services/dataService.ts`               | 后端服务   |
| 894  | `tests/unit/routes/backtest-routes.test.ts` | 测试       |
| 821  | `api/engine/portfolio.ts`                   | 引擎       |
| 817  | `tests/unit/services/data-service.test.ts`  | 测试       |

---

## 二、已识别的问题清单

### 问题 A：测试代码大量重复

#### A1. `startApp()` 函数重复（22 个路由测试文件）

每个路由测试文件都自行定义 `startApp()`（在随机端口启动 Express + 返回 `{ url, close }`），约 15 行 × 22 文件 = **~330 行重复代码**。

**受影响文件**：`tests/unit/routes/*.test.ts`（全部 22 个）

**方案**：抽取到 `tests/helpers/expressApp.ts`，提供统一的 `startApp(routes)` 工厂函数。

#### A2. Logger mock 重复（48+ 个测试文件）

以下模式在 48+ 个测试文件中逐字重复：

```typescript
vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));
```

**方案**：抽取到 `tests/helpers/mockFactories.ts`，提供 `mockLogger()` 和 `createLoggerMock()` 工厂。

#### A3. `createMockReq/Res/Next` 重复（5+ 个中间件测试文件）

中间件测试各自定义略有不同的 mock 请求/响应/next 辅助函数，签名不一致。

**受影响文件**：`tests/unit/middleware/validate.test.ts`、`rbac.test.ts`、`jwtAuth.test.ts`、`auth.test.ts`、`auditLog.test.ts`、`idempotency.test.ts`

**方案**：抽取到 `tests/helpers/expressMocks.ts`，提供统一的 `createMockRequest()`、`createMockResponse()`、`createMockNext()`。

#### A4. Config mock 重复

多个测试文件各自定义 `config` mock 对象，字段不一致。

**方案**：在 `tests/helpers/mockFactories.ts` 中提供 `createConfigMock(overrides?)` 工厂。

#### A5. `beforeEach`/`afterEach` 样板代码重复

路由测试文件中 `vi.clearAllMocks()` + `server = await startApp()` + `await server.close()` 模式重复 22 次。

**方案**：提供 `setupRouteTest(routes)` 辅助函数封装完整生命周期。

---

### 问题 B：测试文件命名不一致

AGENTS.md 规定文件使用 camelCase。但测试文件命名混乱：

| 目录                     | camelCase                                                                                                   | kebab-case | 说明           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- | -------------- |
| `tests/unit/routes/`     | `healthRoutes.test.ts` (1)                                                                                  | 其余 21 个 | 1 个异类       |
| `tests/unit/middleware/` | `auditLog.test.ts`, `auditLog.transactional.test.ts`, `jwtAuth.test.ts`, `jwtAuth.rs256.test.ts` (4)        | 其余 6 个  | 4 个异类       |
| `tests/unit/services/`   | `outboxWriter.test.ts`, `loginLockout.test.ts`, `backtestRunRepo.test.ts` (3)                               | 其余 11 个 | 3 个异类       |
| `tests/unit/db/`         | `macroData.test.ts`, `marketStats.test.ts` (2)                                                              | —          | 全部 camelCase |
| `tests/unit/utils/`      | `errors.test.ts`, `integrity.test.ts`, `logger.test.ts`, `metrics.test.ts`, `portfolio-storage.test.ts` (5) | 其余 12 个 | 5 个异类       |

**方案**：统一为 kebab-case（因大多数测试文件已使用 kebab-case，统一成本最低）。需重命名约 15 个文件并更新所有引用。

---

### 问题 C：死代码与空目录

#### C1. `tests/rust-engine/` 空目录

Rust 引擎已退役（ADR-008），该目录为空，应删除。

#### C2. `api/utils/rustFallback.ts` 和 `api/utils/rustBodyBuilder.ts` 命名误导

文件名仍为 `rust*`，但实际调用 Go 引擎。函数名 `buildRustPortfolioBody`、`callRustWithFallback` 同样误导。

**方案**：

- `rustFallback.ts` → `engineClient.ts`
- `rustBodyBuilder.ts` → `engineBodyBuilder.ts`
- `buildRustPortfolioBody` → `buildEnginePortfolioBody`
- `buildRustParams` → `buildEngineParams`
- `callRustWithFallback` → 已 `@deprecated`，确认无调用后删除

#### C3. `tests/helpers/constants.ts` 中的 `ENGINE_PORT` 和 `ENGINE_BASE_URL`

已 `@deprecated`，Rust 引擎已退役。确认无引用后删除。

---

### 问题 D：非测试代码复杂度过高

#### D1. `src/pages/BacktestPage.tsx`（1369 行）

单文件包含回测参数表单、结果展示、图表渲染、状态管理。应拆分为子组件。

#### D2. `api/middleware/jwtAuth.ts`（1231 行）

JWT 签发、验证、刷新、撤销、RS256/HS256 双算法、Redis 会话管理混在一个文件。应按职责拆分。

#### D3. `api/services/dataService.ts`（903 行）

数据获取、缓存、Go 服务调用、信号量控制混合。应按职责拆分。

#### D4. `api/engine/portfolio.ts`（821 行）

回测核心引擎，包含组合计算、再平衡、统计分析。函数 `runSinglePortfolio` 曾被标记为 269 行的"上帝函数"。

#### D5. `api/engine/optimizer.ts`（670 行）

优化器实现，复杂度高。

---

### 问题 E：`no-explicit-any` 滥用（284 处）

大量使用 `any` 类型，降低类型安全性。集中在：

- 测试文件中的 mock 对象
- API 路由处理函数中的 `req.body`
- 前端组件的 props

**方案**：

1. 测试文件：用 `as unknown as Type` 替代 `as any`，或定义正确的 mock 类型
2. API 代码：用 Zod 推导类型或 `Partial<T>` 替代 `any`
3. 前端代码：补充正确的 props 类型

---

### 问题 F：`no-unused-vars`（32 处）

未使用的变量、导入和函数参数。应逐一清理。

---

## 三、分阶段执行计划

### Phase 0：死代码清理（低风险，高收益）

> 目标：删除无用文件和目录，消除命名误导。不改变任何运行时行为。

| #   | 任务                                                                       | 文件                         | 验证                             |
| --- | -------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| 0.1 | 删除空目录 `tests/rust-engine/`                                            | `tests/rust-engine/`         | `npm run test` 通过              |
| 0.2 | 删除 `constants.ts` 中的 `ENGINE_PORT` 和 `ENGINE_BASE_URL`                | `tests/helpers/constants.ts` | grep 确认无引用                  |
| 0.3 | 重命名 `rustFallback.ts` → `engineClient.ts`                               | `api/utils/`                 | `npm run check` + `npm run test` |
| 0.4 | 重命名 `rustBodyBuilder.ts` → `engineBodyBuilder.ts`                       | `api/utils/`                 | `npm run check` + `npm run test` |
| 0.5 | 重命名函数 `buildRustPortfolioBody` → `buildEnginePortfolioBody`           | 全局                         | `npm run check` + `npm run test` |
| 0.6 | 重命名函数 `buildRustParams` → `buildEngineParams`                         | 全局                         | `npm run check` + `npm run test` |
| 0.7 | 删除 `@deprecated callRustWithFallback`（确认无调用）                      | `api/utils/engineClient.ts`  | grep + `npm run test`            |
| 0.8 | 重命名测试文件 `rust-fallback.test.ts` → `engine-client.test.ts`           | `tests/unit/utils/`          | `npm run test`                   |
| 0.9 | 重命名测试文件 `rust-body-builder.test.ts` → `engine-body-builder.test.ts` | `tests/unit/utils/`          | `npm run test`                   |

---

### Phase 1：测试基础设施抽取（消除重复）

> 目标：将重复的测试辅助代码抽取到共享模块。每个子任务独立提交，逐步替换。

| #    | 任务                                                                                                 | 新增文件                          | 影响文件       | 验证                |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------------------- | -------------- | ------------------- |
| 1.1  | 创建 `mockFactories.ts`：`createLoggerMock()`、`createConfigMock()`                                  | `tests/helpers/mockFactories.ts`  | —              | 新文件 lint 通过    |
| 1.2  | 创建 `expressMocks.ts`：`createMockRequest()`、`createMockResponse()`、`createMockNext()`            | `tests/helpers/expressMocks.ts`   | —              | 新文件 lint 通过    |
| 1.3  | 创建 `expressApp.ts`：`startApp(mountPath, router, options?)`                                        | `tests/helpers/expressApp.ts`     | —              | 新文件 lint 通过    |
| 1.4  | 创建 `routeTestSetup.ts`：`setupRouteTest()` 封装 beforeEach/afterEach                               | `tests/helpers/routeTestSetup.ts` | —              | 新文件 lint 通过    |
| 1.5  | 迁移路由测试使用 `startApp()` 共享函数（批次 1：admin, api-key, auth, backtest, backtest-optimizer） | —                                 | 5 个路由测试   | `npm run test:unit` |
| 1.6  | 迁移路由测试使用 `startApp()` 共享函数（批次 2：billing, config, data, data-manage, debug）          | —                                 | 5 个路由测试   | `npm run test:unit` |
| 1.7  | 迁移路由测试使用 `startApp()` 共享函数（批次 3：goal-optimizer, health, job, letf, org）             | —                                 | 5 个路由测试   | `npm run test:unit` |
| 1.8  | 迁移路由测试使用 `startApp()` 共享函数（批次 4：pca, persistence, portfolio, run, signal）           | —                                 | 5 个路由测试   | `npm run test:unit` |
| 1.9  | 迁移路由测试使用 `startApp()` 共享函数（批次 5：tactical, tactical-grid）                            | —                                 | 2 个路由测试   | `npm run test:unit` |
| 1.10 | 迁移中间件测试使用 `expressMocks.ts`（validate, rbac, auth, auditLog, idempotency）                  | —                                 | 5 个中间件测试 | `npm run test:unit` |
| 1.11 | 迁移所有测试使用 `createLoggerMock()`（分 3 批，每批 ~16 文件）                                      | —                                 | ~48 个测试文件 | `npm run test:unit` |
| 1.12 | 迁移测试使用 `createConfigMock()`（按需，仅替换字段一致的场景）                                      | —                                 | ~15 个测试文件 | `npm run test:unit` |

---

### Phase 2：测试文件命名统一

> 目标：统一测试文件命名为 kebab-case（因多数已使用此格式，迁移量最小）。

| #   | 任务                                                                | 涉及文件 | 验证                |
| --- | ------------------------------------------------------------------- | -------- | ------------------- |
| 2.1 | 路由测试重命名：`healthRoutes.test.ts` → `health-routes.test.ts`    | 1 个     | `npm run test:unit` |
| 2.2 | 中间件测试重命名：`auditLog.test.ts` → `audit-log.test.ts` 等       | 4 个     | `npm run test:unit` |
| 2.3 | 服务测试重命名：`outboxWriter.test.ts` → `outbox-writer.test.ts` 等 | 3 个     | `npm run test:unit` |
| 2.4 | DB 测试重命名：`macroData.test.ts` → `macro-data.test.ts` 等        | 2 个     | `npm run test:unit` |
| 2.5 | Utils 测试重命名：`errors.test.ts` → `errors.test.ts`（无需改）等   | 5 个     | `npm run test:unit` |
| 2.6 | 同步更新 `vitest.config.ts` 中的 include 规则（如需要）             | 1 个     | `npm run test:unit` |

**注意**：需同时更新 `api/middleware/auditLog.transactional.test.ts` → `audit-log.transactional.test.ts` 和 `jwtAuth.rs256.test.ts` → `jwt-auth.rs256.test.ts`。

---

### Phase 3：ESLint `no-unused-vars` 清理（32 处）

> 目标：清除所有未使用的变量和导入。零风险，纯删除。

| #   | 任务                                                            | 验证                    |
| --- | --------------------------------------------------------------- | ----------------------- |
| 3.1 | 清理 `api/` 中的 unused vars                                    | `npm run lint` 警告减少 |
| 3.2 | 清理 `src/` 中的 unused vars                                    | `npm run lint` 警告减少 |
| 3.3 | 清理 `tests/` 中的 unused vars                                  | `npm run lint` 警告减少 |
| 3.4 | 将 `@typescript-eslint/no-unused-vars` 从 `warn` 升级为 `error` | `npm run lint` 无新警告 |

---

### Phase 4：ESLint `no-explicit-any` 清理（284 处）

> 目标：用精确类型替代 `any`。分批进行，避免一次性大量改动。

| #   | 任务                                                          | 影响范围           | 预计消除 | 验证                                  |
| --- | ------------------------------------------------------------- | ------------------ | -------- | ------------------------------------- |
| 4.1 | 测试文件中的 `any` → 用 `as unknown as Type` 或定义 mock 类型 | `tests/`           | ~120     | `npm run test:unit`                   |
| 4.2 | API 代码中的 `any` → 用 Zod 推导类型或 `Partial<T>`           | `api/`             | ~100     | `npm run check` + `npm run test:unit` |
| 4.3 | 前端代码中的 `any` → 补充 props 类型                          | `src/`             | ~64      | `npm run check` + `npm run build`     |
| 4.4 | 评估是否将 `no-explicit-any` 升级为 `error`                   | `eslint.config.js` | —        | `npm run lint`                        |

---

### Phase 5：复杂度降低（`max-lines-per-function` + `complexity` + `cognitive-complexity`）

> 目标：拆分长函数，降低圈复杂度和认知复杂度。每个任务独立提交。

#### 5A. API 代码拆分

| #   | 任务                            | 文件                          | 当前问题                                      | 方案                                                                     |
| --- | ------------------------------- | ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| 5.1 | 拆分 `jwtAuth.ts`（1231 行）    | `api/middleware/jwtAuth.ts`   | JWT 签发/验证/刷新/撤销/双算法/Redis 会话混合 | 按职责拆为 `jwtSigner.ts`、`jwtVerifier.ts`、`sessionStore.ts`           |
| 5.2 | 拆分 `dataService.ts`（903 行） | `api/services/dataService.ts` | 数据获取/缓存/Go 调用/信号量混合              | 拆为 `dataFetcher.ts`、`dataCache.ts`                                    |
| 5.3 | 拆分 `portfolio.ts` 中的长函数  | `api/engine/portfolio.ts`     | `runSinglePortfolio` 过长                     | 提取子函数：`applyRebalance`、`calculateDrawdown`、`calculateStatistics` |
| 5.4 | 拆分 `optimizer.ts` 中的长函数  | `api/engine/optimizer.ts`     | 优化逻辑过长                                  | 提取 `gridSearch`、`evaluateObjective`                                   |

#### 5B. 前端代码拆分

| #   | 任务                                            | 文件                           | 当前问题            | 方案                                                            |
| --- | ----------------------------------------------- | ------------------------------ | ------------------- | --------------------------------------------------------------- |
| 5.5 | 拆分 `BacktestPage.tsx`（1369 行）              | `src/pages/BacktestPage.tsx`   | 表单+结果+图表+状态 | 提取 `BacktestForm`、`BacktestResults`、`BacktestCharts` 子组件 |
| 5.6 | 拆分 `AnalysisPage.tsx`（1131 行）              | `src/pages/AnalysisPage.tsx`   | 同上                | 提取子组件                                                      |
| 5.7 | 拆分 `MonteCarloPage.tsx`（973 行）             | `src/pages/MonteCarloPage.tsx` | 同上                | 提取子组件                                                      |
| 5.8 | 修复 `react-hooks/exhaustive-deps` 警告（5 处） | `src/`                         | 依赖数组不完整      | 逐一修复或添加 eslint-disable 注释（附理由）                    |

#### 5C. 测试文件拆分

| #    | 任务                                     | 文件                     | 当前问题             | 方案                                                                                  |
| ---- | ---------------------------------------- | ------------------------ | -------------------- | ------------------------------------------------------------------------------------- |
| 5.9  | 拆分 `jwtAuth.test.ts`（1201 行）        | `tests/unit/middleware/` | 单文件覆盖太多场景   | 按 `jwtSigner`/`jwtVerifier`/`sessionStore` 拆分                                      |
| 5.10 | 拆分 `backtest-store.test.ts`（1178 行） | `tests/unit/store/`      | 单文件过大           | 按 store action 分组拆分                                                              |
| 5.11 | 拆分 `backtest-routes.test.ts`（894 行） | `tests/unit/routes/`     | 5 个端点混在一个文件 | 按端点拆为 `backtest-portfolio-routes.test.ts`、`backtest-analysis-routes.test.ts` 等 |
| 5.12 | 拆分 `data-service.test.ts`（817 行）    | `tests/unit/services/`   | 单文件过大           | 按功能拆分                                                                            |

---

### Phase 6：一致性收尾

| #   | 任务                                                       | 验证                  |
| --- | ---------------------------------------------------------- | --------------------- |
| 6.1 | 统一所有 `vi.mock` 的路径风格（相对路径深度一致）          | `npm run lint`        |
| 6.2 | 统一所有测试文件的 JSDoc 头部注释格式                      | 人工 review           |
| 6.3 | 确认 `eslint.config.js` 中所有 `warn` 规则可升级为 `error` | `npm run lint`        |
| 6.4 | 运行全量测试确认无回归                                     | `npm run test`        |
| 6.5 | 运行类型检查确认无回归                                     | `npm run check`       |
| 6.6 | 运行 E2E 测试确认无回归                                    | `npm run test:e2e:ui` |

---

## 四、执行原则

1. **行为不变**：每个改动后运行 `npm run test` 和 `npm run check`，确保零回归
2. **增量提交**：每个子任务是一个独立的 commit，便于 review 和 revert
3. **先理解后改动**：对不熟悉的代码，先读上下文再修改（Chesterton's Fence）
4. **不扩大范围**：不碰与当前任务无关的代码
5. **测试先行**：如果改动涉及逻辑重构，先确认测试覆盖了该路径
6. **不过度简化**：保留有意义的抽象，不为减少行数而牺牲可读性

---

## 五、优先级排序

| 优先级 | Phase         | 理由                                     |
| ------ | ------------- | ---------------------------------------- |
| P0     | Phase 0       | 死代码清理，零风险，立即收益             |
| P0     | Phase 3       | unused vars 清理，零风险                 |
| P1     | Phase 1       | 测试基础设施，消除大量重复，后续改动受益 |
| P1     | Phase 4.1     | 测试文件 `any` 清理，量大但简单          |
| P2     | Phase 2       | 命名统一，改善一致性                     |
| P2     | Phase 4.2-4.3 | API/前端 `any` 清理                      |
| P3     | Phase 5       | 复杂度降低，改动较大，需谨慎             |
| P3     | Phase 6       | 收尾确认                                 |

---

## 六、进度跟踪

执行时在此处标记完成状态：

- [x] Phase 0: 死代码清理
  - [x] 0.1-0.2: 删除空目录、废弃常量
  - [x] 0.3-0.9: rustFallback → engineClient, rustBodyBuilder → engineBodyBuilder 重命名
- [x] Phase 1: 测试基础设施抽取
  - [x] 1.1: 创建 mockFactories.ts（createLoggerMocks/mockLogger）
  - [x] 1.2: 创建 expressMocks.ts（createMockRequest/Response/Next）
  - [x] 1.3: 创建 expressApp.ts（startExpressApp + TestRequest 类型 + bodyLimit 选项）
  - [x] 1.5-1.9: 全部 22 个路由测试迁移到 startExpressApp
  - [x] 1.10-1.12: 中间件测试迁移、logger mock 迁移（已完成）
- [x] Phase 2: 测试文件命名统一
  - [x] 14 个 camelCase 测试文件重命名为 kebab-case
- [x] Phase 3: `no-unused-vars` 清理
- [x] Phase 4: `no-explicit-any` 清理
  - [x] 4.1（路由测试）: 全部 22 个路由测试 any 清零
  - [x] 4.1（中间件测试）: 全部 10 个中间件测试 any 清零
  - [x] 4.1（其他测试）: 全部测试文件 any 清零
  - [x] 4.2（API 代码）: 全部 41 处 any 清零（通过 Express Request 类型增强 + 精确类型替换）
  - [x] 4.3（前端代码）: 前端无 any 警告
- [x] Phase 5: 复杂度降低（全部完成）
  - [x] 5a: no-unused-vars（4处）+ react-hooks/exhaustive-deps（5处）全部清零
  - [x] 5b: portfolio.ts 重构（runSinglePortfolio 从 221行/复杂度46 拆分为 6 个小函数，警告 8→2）
  - [x] 5b（续）: 其他引擎/前端文件复杂度优化（全部清零，ESLint 0 错 0 警告）
- [x] Phase 6: 一致性收尾与全量回归验证

### 量化进展

| 指标                           | 起始值 | 当前值             | 变化        |
| ------------------------------ | ------ | ------------------ | ----------- |
| ESLint 警告                    | 513    | 0                  | -513 (100%) |
| TypeScript 错误                | 0      | 0                  | —           |
| 单元测试                       | —      | 2956 通过 / 0 失败 | —           |
| `no-explicit-any`              | 284    | 0                  | -284 (100%) |
| `no-unused-vars`               | 32     | 0                  | -32 (100%)  |
| `react-hooks/exhaustive-deps`  | 5      | 0                  | -5 (100%)   |
| `max-lines-per-function`       | 86     | 0                  | -86 (100%)  |
| `complexity`                   | 45     | 0                  | -45 (100%)  |
| `sonarjs/cognitive-complexity` | 43     | 0                  | -43 (100%)  |
