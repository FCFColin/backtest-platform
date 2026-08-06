# 瘦身审计报告 v9（当前状态重扫）

基线（scc 口径）：108,961 行（TS 81,005 / Go 14,586 / JS 3,746 / YAML 3,263 / MD 2,164 / JSON 2,046 …）
目标（AGENTS.md）：~100,000 行 → 尚缺 ~8,960。
注意：本报告为**当前工作树**（含未提交 −2,078 行改动）基础上重扫结果；v6/v8 报告（plan2.md/旧 plan.md）已执行完毕。

## 剩余确定性机会（按净省降序）

### B1. 纯 "what" 注释清理 — backend（净省 ~150-200）

- 现状：`packages/backend/src/` 各文件头部大块与 JSDoc 大量只说"代码在做什么"的注释。例：`dataUpdateWorker.ts:1-14,28-29,33-37,44-54,100-108,165-169`（单文件 ~40-45）；`quota.ts:1-17`、`apiKeyVerifier.ts:1-19`、`auditExporter.ts:1-15`、`dataFacade.ts:1-12`、`jwtAuth.ts` 内联 ~25。
- 为什么省：代码已自注释（函数名自解释）；AGENTS.md 注释 MUST 明令删 what、留 why（ADR 引用/安全权衡/TODO）。
- 风险：中。必须逐行保留 why（`backtestQueue.ts:47,52,58,67-72,122,137` 的 C-021/P0-03/ADR-045、`quota.ts` fail-closed、`app.ts:117` P0-1 BFF），不可正则批量删。
- 骨架：无——按 AGENTS.md 逐条删。

### B2. tacticalConfigRepository → createTenantCrudRepo（净省 ~95）

- 现状：`packages/backend/src/repositories/tacticalConfigRepository.ts`（171 行）手写 `findByTenant/findById/create/update/delete` 五方法 + `mapRow` + `SELECT_COLS`，与工厂 `tenantCrudRepo.ts`（65 行）同构；同族 `savedConfigRepo.ts`（48 行）已用工厂。
- 骨架：`export const tacticalConfigRepo = createTenantCrudRepo<TacticalConfig>({ table: 'tactical_configs', columns, mapRow, validate })`
- 风险：低。核对 `findByTenant` 排序语义（updated_at 倒序）工厂 `list` 是否需加可选 `orderBy`。
- 文件：171 → ~75。

### B3. BullMQ Queue 单例 + Worker 工厂三合一（净省 ~70-80）

- 现状：Queue 单例 ×3（`backtestQueue.ts:43-63`、`queueDefinitions.ts:26-37,53-63`）；Worker 工厂 ×3（`backtestQueue.ts:79-145`、`dataUpdateWorker.ts:170-201`、`queueDefinitions.ts:77-101`）；失败转移块重复（`backtestQueue.ts:123-124` 与 `dataUpdateWorker.ts:195-196` 的 `isFinalFailure→transferToDlq`）。
- 骨架（入 `queueUtils.ts`）：`createQueueWorker(name, processor, {concurrency, dlq, onFailed, onCompleted})` + `createQueueSingleton(name, jobOptions)`。
- 风险：中低。backtest progress 推送为 ADR-045 特有逻辑，保留在回调参数。
- 文件：3×(12+18) 样板 → 2 工厂。

### G1. data-fetcher worker↔store DB 层归并（净省 ~80-100）

- 现状：ticker upsert 5 变体 3 文件（`cmd/worker/db.go:97-103,189-194`、`universe_builder.go:163-167`、`commands.go:40-42`、`internal/store/store.go:170-171`）；prices batch upsert 2 骨架（`db.go:169-202` 8 列 vs `store.go:164-200` 13 列含 `_numeric`）；连接池样板 2 处（`db.go:12-34` MaxConns=5 vs `store.go:37-63` MaxConns=10+TLS）；`db.go:35-63` `ensureSchema` 是 `001_initial_schema.sql` 子集（若迁移先跑则为死代码）。
- 骨架：抽 `upsertTicker(ctx, pool, ticker, category, market, exchange, mode)`；worker 改经 `store.DataStore` 写入。
- 风险：中。`_numeric` 列口径（行为上是修复非破坏）；`sanitizePrices`（25 行）需随迁；`ensureSchema` 依赖迁移先行。
- 文件：db.go 202→~110、universe_builder 270→~185。

### B4. 后端单体文件收敛（净省 ~65-70）

- `routes/healthRoutes.ts:13-38` 手写 `safeEqual/checkBearerToken` 与 jwtAuth 共享（~25，两处鉴权语义不同需谨慎）；`workerEntrypoint.ts:22-45` shutdown 表驱动（~10）；`dataQuery.ts` 残余收敛（~30）。

### F1. admin 4 页 fetch 样板 → 共享 hook（净省 ~40-50）

- 现状：`AdminDashboard.tsx`/`DataManagement.tsx`/`SystemMonitor.tsx`（51-71）/`SystemSettings.tsx` 各自 `apiFetch + useToastStore + reportError + useState loading/error` 样板 ~12-15 行 ×4（例 `SystemMonitor.tsx:53-71`）。
- 骨架：`useAdminData<T>(url, {defaults, mapper})` → `{data, loading, refresh}`。
- 风险：低。各页 mapper 不同，hook 只收"fetch+错误+loading"。

### F2. SvgFanChart ResizeObserver → MeasuredContainer（净省 ~10-15）

- 现状：`pages/monte-carlo/SvgFanChart.tsx:24` 自实现 ResizeObserver 测宽，与 `components/charts/sharedChartContent.tsx:48` 的 `MeasuredContainer`（5 处使用）重复。
- 风险：低。

### F3. rebalance 选项 4 源表驱动（净省 ~20-30）

- 现状：`utils/constants.ts:114` REBALANCE_LBL、`pages/tactical/sharedTacticalConstants.ts:23` REBALANCE_OPTIONS、`pages/account/AccountPage.tsx:28` REBALANCE_OPTS、`pages/monte-carlo/MonteCarloParams.tsx:45` rebalanceItems、`rebalancing-sensitivity/rebalancingSensitivityBuilders.ts:10` 平行。
- 骨架：以 `RebalanceFrequency` 为 key 合并到一个 `REBALANCE_OPTIONS`（含 color/label），4 处消费。
- 风险：低-中（rebalancing-sensitivity 多 color 字段，需参数化）。

### F4. BillingPage/PricingPage PlanCard 平行（净省 ~30-40）

- 现状：`BillingPage.tsx:28-52` 与 `PricingPage.tsx:39-54` 各有一份 `usePlans`；`BillingPage.tsx:54-94` 与 `PricingPage.tsx:189-277` 各有一份 PlanCard（样式体系不同：Tailwind vs 内联）。
- 风险：中（两处样式体系不同，合并需保留各自 UI；收益有限）。

### F5. statistics-table 指标格式化重叠（净省 ~30）

- 现状：`components/statistics-table/index.tsx`（行式 MetricsRows）与 `StatisticsTable.tsx`（列式 SimpleTable）指标格式化逻辑重叠。
- 风险：中（非同一组件，仅共享 fmt 逻辑）。

### G2. montecarlo 统计委托（净省 ~10）

- `montecarlo.go:118-121` 内联 sharpe 与 `engine.CalcSharpe` 等价 → 委托（~3）；`mcSortino`（157-164）与 `engine.CalcSortino` 结构同但日无风险利率口径不同（简单除法 vs 复利），统一后 ~7。
- 风险：中（Sortino 输出数值微变；测试不断言数值故安全）。

### G3. goaloptimizer 内联 maxDD → engine.CalcMaxDrawdown（净省 ~8）

- `goaloptimizer.go:95-111` 内联峰值追踪 → 循环后 `engine.CalcMaxDrawdown(path)`（~8）。
- 风险：低（每路径多一次 O(n) 遍历，可忽略）。

### G4. engine 双常量源（净省 ~1）

- `engine/types.go:222` `const tradingDays = 252` 与 `engineutil.TradingDaysPerYear` 同包双源，3 处 int 转换统一。风险：无。

### 已确认无空间 / 已收敛（勿再动）

- 前端 signal 家族、PCAPage、sharedFields、tables（SimpleTable/SortableTable）、shells（ComputeToolShell）、resultsShell：已共享。
- 后端 routeUtils(265)、jobSubmission(94)、middlewareChains(43)、apiKeyAuth(113)、rateLimiter(205 全表驱动)、express-openapi-validator（仅 dev 启用，设计使然）：已收敛。
- Go 常量/统计委托（signal/calculators/goaloptimizer vol/tactical/optimizer 已委托 engine）、handler 泛型 `withComputeHandler`、provider 共享 `NewBaseProvider`、Go 测试表驱动：已解决。
- calculators 家族（BaseCalculatorUI 已合并，各计算器 <30 行）。

## 汇总

| 类别                                                                          | 净省         |
| ----------------------------------------------------------------------------- | ------------ |
| 后端注释 + 工厂 + 队列                                                        | ~315-375     |
| Go data-fetcher + engine                                                      | ~100-115     |
| 前端 admin/图表/rebalance/billing                                             | ~100-160     |
| **本轮合计**                                                                  | **~515-650** |
| 上轮未落地（infra docker/k8s ~790、tests ~550、shared ~50-100，均已出过骨架） | ~1,390-1,440 |

**诚实结论**：当前工作树基础上，确定性剩余合计约 **1,900-2,100 行**，距 ~8,960 缺口仍大。仓库已被反复瘦身（179,541 → 108,961，−39.3%），进一步大额削减需转向**更高风险**方向：测试瘦身（~31k 行但已高度表驱动，诚实收益仅 ~500）、i18n 977 行内联化、跨服务契约合并、或接受行为变更（如 Sortino 口径统一）。

## 待决

1. 是否先落地本报告 ~515-650 行（低风险）？
2. 缺口 ~7,000 行需授权激进方向（列优先级让用户选）。
