# 切片04：数据流完整性

## Q1: 关键路径（回测/MC/优化）前端状态变更链路是否完整？

### 证据

**前端 store（`packages/frontend/src/store/backtestStore.ts`）**：

- `runBacktestAction` (L211-262)：
  - Enter: `set({ isLoading: true })` (L216)
  - 验证失败: `set({ isLoading: false })` (L223) + toast warning
  - HTTP success ≠ 200: `throw new Error(extractApiErrorDetail(json))` → catch → `handleBacktestError` → toast
  - `json.success === false`: toast error + `set({ results: null })` (L240-243)
  - HTTP 200 + success: `normalizeBacktestResult(json.data)` → `set({ results })` + `set({ isLoading: false })` (L249-253)
  - catch (网络/Abort/异常): `handleBacktestError` → toast + `set({ results: null })` (L255-258)
  - finally: `set({ isLoading: false })` (L259-261)
- `handleBacktestError` (L187-198)：覆盖 `AbortError` / `TypeError` / `Error.message` / 兜底，四种分支均到 toast
- `enrichSeriesAction` (L264-311)：catch 块只 `console.error`，不更新任何 UI 状态 — 但此路径是静默补全非关键序列，可接受

**调用链路**：

```
BacktestPage → store.runBacktest()
  → set(isLoading: true)
  → fetch('/api/backtest/portfolio', { body })
  → backtestRoutes.ts: callEngineStrict('/api/engine/backtest', body)
      → engineClient.ts: goCircuitBreaker.fire() + retryWithBackoff()
      → throw EngineUnavailableError / return result
  → handleEngineUnavailable → 503 problem+json
  → catch TimeoutError → 503
  → catch generic → 500
```

**状态矩阵**：

| 场景                | isLoading     | results      | toast   | issues            |
| ------------------- | ------------- | ------------ | ------- | ----------------- |
| 验证失败            | false         | 不变(可能旧) | warning | 旧 results 不清除 |
| HTTP 非200          | false → false | null         | error   | ✓                 |
| json.success==false | false         | null         | error   | ✓                 |
| 成功                | false         | new data     | 无      | ✓                 |
| 网络错误/Abort      | false         | null         | error   | ✓                 |
| 超时                | false         | null         | error   | ✓                 |

### 分析

三种状态覆盖：

- **loading**: `isLoading: true/false` + `AbortController` (支持取消旧请求) ✓
- **success**: `results` 设置 + `activeTab` 切换到 summary ✓
- **error**: 所有分支均通过 toast 展示错误信息 ✓

**问题发现：验证失败时旧结果不清除**

当验证失败（如权重和不等于100）时，L221-224 仅设置 `isLoading: false` 但不清除 `results`。用户看到的是上一次成功的回测结果，可能误以为当前参数的回测已成功运行。这是一个**中等风险的前端状态残留 bug**。

**`backtestStore.ts` 使用 `raw fetch`，而非 `apiFetch`**

L229 直接调用 `fetch('/api/backtest/portfolio', ...)`，未使用 `apiFetch`（后者在 `packages/frontend/src/utils/apiClient.ts:128` 中封装了 JWT 刷新、degraded 标记拦截）。由于回测 API 路径 (`/api/backtest/`) 未挂载 `requireApiKey` 中间件（它使用 session cookie 或未启用），且 ADR-031 规定回测路径 fail-closed 不返回 degraded，此问题目前无实际影响。但 degraded 标记被忽略。

### 结论

❌ **不完整**。关键路径的 loading/success/error 三态覆盖良好，但有**一处状态残留**：验证失败时旧 results 未清除。建议在 L224 后增加 `set({ results: null })`。

---

## Q2: 错误传播：Go 503 → Node API → 前端展示有无被吞掉的情况？

### 证据

**后端错误链**：

1. `engineClient.ts:callEngineStrict` (L259-278)：
   - Go 引擎失败 → `retryWithBackoff` 耗尽 → `throw new EngineUnavailableError(endpoint)`
   - `EngineUnavailableError` 携带 `retryAfterSeconds` (默认30)

2. `backtestRoutes.ts:handleEngineUnavailable` (L54-63)：
   - `sendProblem(res, 503, 'ENGINE_UNAVAILABLE', ...)` → RFC 7807 格式
   - 设置 `Retry-After` 响应头

3. `backtestRoutes.ts` 各 catch 块（portfolio L245-256 / monte-carlo L407-413 / optimize L452-459 / frontier L493-500）：
   - 统一模式: `if (handleEngineUnavailable(res, error)) return;` → 处理 TimeoutError → 兜底 500

4. `timeout.ts` (L29-34): `withTimeout` 使用 `Promise.race`，超时抛 `TimeoutError` → 路由层统一捕获为 503

**前端错误链**：

1. `backtestStore.ts` L238: `if (!response.ok) throw new Error(extractApiErrorDetail(json))`
2. `extractApiErrorDetail` (L86-97): 多格式兼容 — RFC 7807 `{ error: { detail } }` / 旧版 `{ detail }` / 兜底国际化消息
3. `handleBacktestError` (L187-198): 四种错误类型分别映射到 toast

**错误传播连续性检查**：

```
Go engine 503 → callEngineStrict throw EngineUnavailableError
  → backtestRoutes.ts handleEngineUnavailable → sendProblem(503)
    → 前端 fetch→!response.ok→throw Error(extractApiErrorDetail)
      → handleBacktestError → toast
```

所有路径都有明确终止（toast 或界面更新）。没有 catch 后静默吞掉错误的路径。

### 分析

连续路径完整。但有一个**观测缺口**：

- 静默降级模式（引擎降级到本地计算）已根据 ADR-031 不存在
- 数据降级的 `degraded` 标记通过 `apiClient.ts` 拦截后写入 `degradedStore`，但回测页面不使用 `apiFetch`，如果未来有路由返回 degraded，不会被自动捕获
- `backtestStore.ts` 的 `processResponseWarnings` (L201-208) 确实处理了 `json.degraded + json.degradedWarning`，但只展示 toast 而非更新 `degradedStore` 的全局状态条

| 错误来源         | 路由 catch                | 前端 catch                     | 用户可见      |
| ---------------- | ------------------------- | ------------------------------ | ------------- |
| Go engine 503    | ✓ handleEngineUnavailable | ✓ extractApiErrorDetail        | ✓ toast error |
| Timeout 超时     | ✓ TimeoutError→503        | ✓ 同上                         | ✓ toast error |
| 通用 500         | ✓ sendProblem(500)        | ✓ 同上                         | ✓ toast error |
| 422 验证         | ✓ sendProblem(422)        | ✓ 同上                         | ✓ toast error |
| Abort (前端主动) | —                         | ✓ AbortError→timeout toast     | ✓ toast error |
| 网络断开         | —                         | ✓ TypeError→networkError toast | ✓ toast error |

### 结论

✅ **基本完整**。Go 引擎 fail-closed 的 503 错误通过 `EngineUnavailableError` → `sendProblem(RFC 7807)` → `extractApiErrorDetail` → `handleBacktestError` → toast 全程无丢失。

**但存在格式兼容性风险**：`extractApiErrorDetail` 支持多种错误格式（RFC 7807 嵌套 `error.detail`、旧版扁平 `detail`、兜底字符串），增加了维护复杂度。如果后端未来变更错误格式，前端可能吞掉错误细节仅展示兜底消息。

---

## Q3: `degraded: true` 标记在后端所有降级场景中都正确设置了？

### 证据

**后端出现 `degraded` 的完整列表**：

| 文件                  | 行       | 场景                                 | 设置 degraded                                          |
| --------------------- | -------- | ------------------------------------ | ------------------------------------------------------ |
| `dataRoutes.ts`       | L136-161 | 历史数据：Go 数据服务失败→回退本地   | `degraded=true` + `degradedCode` + `degradedMessage` ✓ |
| `dataRoutes.ts`       | L188-211 | 搜索：Go 数据服务失败→回退本地搜索   | `degraded=true` + `degradedCode` + `degradedMessage` ✓ |
| `dataRoutes.ts`       | L248-256 | CPI：Go 服务失败→PostgreSQL 缓存命中 | `degraded=true` + `degradedCode` + `degradedMessage` ✓ |
| `dataRoutes.ts`       | L262-269 | CPI：Go 服务失败→PostgreSQL 查询成功 | `degraded=true` + `degradedCode` + `degradedMessage` ✓ |
| `backtest-service.ts` | L156     | 回测结果                             | 硬编码 `degraded = false`（ADR-031 fail-closed） ✓     |
| `engineClient.ts`     | L158-201 | `DegradedResponse<T>` 接口定义       | 保留用于旧降级路径，实际未使用                         |

**关键发现：`dataService.ts` 内部降级无 degraded 传播**

`dataService.ts:fetchHistoryData` (L47-109) 内部调用链路：

```
fetchHistoryData(tickers)
  → queryPricesFromDb (PostgreSQL)
  → 若有 missing → fetchMissingFromGoService (Go 数据服务)
  → 返回 Record<string, Record<string, number>>
```

此函数**不返回 degraded 标记**。当 `fetchMissingFromGoService` 失败（Go 不可用）时，它静默返回空结果（L209-211: `logger.warn` 但不抛出），调用方 `backtestRoutes.ts` 的 `collectInvalidTickerWarnings` 会将缺失数据记为 `invalidTickers` 并返回 422（L212-216）。这导致：

- **Go 数据服务降级的 degraded 信息丢失**：降级行为发生时，调用方（backtest route）无感知
- **用户看到"标的代码无效"** ⽽非"数据获取降级"的准确提示

**`dataService.ts:searchTickers` (L142-170)**：

- 内部调用 `searchTickersFromDb` → 失败则 `callGoDataService` → 失败则 `mockSearchResults`
- 降级选择 mock 时只 log warning，不返回 degraded 标记
- 此函数被 `backtestRoutes.ts:search` 端点使用，该端点正常返回 `success: true`，无 degraded 标记

### 分析

| 调用路径                                               | 降级点            | degraded 标记   | 问题              |
| ------------------------------------------------------ | ----------------- | --------------- | ----------------- |
| `GET /api/data/history`                                | Go 数据服务→本地  | ✓ 路由层设置    | —                 |
| `GET /api/data/search`                                 | Go 数据服务→本地  | ✓ 路由层设置    | —                 |
| `GET /api/data/cpi/:country`                           | Go 数据服务→PG    | ✓ 路由层设置    | —                 |
| `POST /api/backtest/portfolio` 内部 `fetchHistoryData` | Go 数据服务不可用 | ✗ 标记丢失      | degraded→422 误导 |
| `POST /api/backtest/*` 内部搜索                        | Go 数据服务不可用 | ✗ 标记丢失      | 无 degraded 提示  |
| `POST /api/backtest/*` 引擎调用                        | Go 引擎不可用→503 | N/A fail-closed | —                 |

**根因**：`dataService.ts` 的 `fetchHistoryData` 和 `searchTickers` 是内部工具函数，设计为返回纯数据（`Record<string, ...>` 或 `TickerSearchResult[]`），不携带 degraded 元信息。路由层调用它们时，如果不能从 Go 降级路径获取 degraded 信息，就无法在响应中设置标记。

### 结论

❌ **不完整**。`dataRoutes.ts` 的公开数据端点正确设置了 `degraded: true`（✓ 4/4 场景），但 `backtestRoutes.ts` **内部调用 `fetchHistoryData` 时的降级信息被吞掉**。原因是 `dataService.ts` 作为纯数据函数，不传播 degraded 元数据到调用方。建议将 `fetchHistoryData` 的返回类型扩展为 `{ data: Record<...>, degraded: boolean }` 以携带降级状态。

---

## Q4: Outbox 模式：事件 → 持久化 → 发布，有无丢失或重复风险？

### 证据

**事务写入（`outboxWriter.ts`）**：

- `writeEventInTransaction` (L52-73)：在调用方已开启的事务内 INSERT outbox 表
- `ON CONFLICT (event_id) DO NOTHING`：支持幂等写入（ADR-024）
- 调用方（`backtest-service.ts` L86-98）：`BEGIN` → `writeEventInTransaction` → `COMMIT` → `NOTIFY outbox_channel`
- ROLLBACK 在 catch 块中（L99-104）

**持久化模式（`005_outbox.sql` + `006_outbox_dedup.sql`）**：

- `outbox` 表：`id (UUID PK)`, `aggregate_type`, `aggregate_id`, `event_type`, `payload (JSONB)`, `created_at`, `processed_at`
- `006_outbox_dedup.sql`：添加 `event_id UUID` + 唯一索引 `uq_outbox_event_id`（`WHERE event_id IS NOT NULL`）
- 历史行（无 event_id）不受唯一约束影响

**发布模式（`outboxPublisher.ts`）**：

- LISTEN/NOTIFY 推送（L36）：`await this.listener.query('LISTEN outbox_channel')`
- 收到通知后 `handleNotification`（L94-127）：读 `WHERE processed_at IS NULL ORDER BY created_at LIMIT 100`
- 处理成功后：`UPDATE outbox SET processed_at = NOW() WHERE id = ANY($1)`
- 补偿扫描器（L182-201）：每 60s 扫描 `created_at < NOW() - 5 min AND processed_at IS NULL` 的事件

**避免重复写入的历史问题**：

- `BacktestCompletedHandler.ts` (L33-53)：根据 ADR-024，**不再写 outbox**，仅结构化日志
- 原文：`此处理器不再写 outbox。outbox 的唯一写入点为 backtest-service 的事务写入`

**发布器与事件分发器的交叉**：

- `outboxPublisher.ts` L102-113：循环处理事件 → `routeEvent` → `eventDispatcher.dispatch` → 处理器执行
- `backtest-service.ts` L115-126：在 COMMIT 后额外 `eventDispatcher.dispatch`（异步 fire-and-forget）

### 分析

**丢失风险**：

| 场景                            | 风险                 | 防护                                                        |
| ------------------------------- | -------------------- | ----------------------------------------------------------- |
| 写入前崩溃                      | 事件丢失             | 无（应用层需重试整个操作，已在用户端通过 abort/retry 处理） |
| 写入后、COMMIT 前崩溃           | 事件随事务回滚       | ✓ 事务原子性保护                                            |
| COMMIT 后、NOTIFY 前崩溃        | 事件持久化但未通知   | ✓ 补偿扫描器 60s 自动拾取                                   |
| NOTIFY 发送但监听器未收到       | 事件持久化但未处理   | ✓ 同上                                                      |
| handleNotification 处理一半崩溃 | 事件未标记 processed | ✓ 下次扫描/通知重新处理（at-least-once）                    |
| 标记 processed_at 前崩溃        | 事件被重复处理       | 无防护，但 at-least-once 是设计决策（见 ADR-024）           |

**重复风险**：

| 场景                                                | 风险等级  | 说明                                                                |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| 同一事件重复写入                                    | ✅ 已解决 | `event_id` + `ON CONFLICT DO NOTHING` 纵深防御                      |
| 历史反馈环（outbox → dispatch → handler → outbox）  | ✅ 已解决 | `BacktestCompletedHandler` 不再写 outbox                            |
| `backtest-service.ts` 的 `eventDispatcher.dispatch` | ⚠️ 低风险 | 此调用在 COMMIT 后执行，BacktestCompletedHandler 只做日志，无副作用 |
| `auditLog.ts` 独立模式写 outbox                     | ⚠️ 低风险 | 不使用 event_id，但审计事件幂等性要求低                             |

**事务边界完整性**：

`backtest-service.ts` 的 L86-107 事务块：

- L89: `BEGIN`
- L90-97: `writeEventInTransaction` (outbox INSERT)
- L98: `COMMIT` + `NOTIFY`
- L99-103: catch → `ROLLBACK`
- L106: finally → `client.release()`

事务边界完整。但 `NOTIFY` 在 COMMIT **之后**执行（L98），符合 PostgreSQL 行为（事务内 NOTIFY 到 COMMIT 时才发送）。

### 结论

✅ **基本可靠**。Outbox 模式的三个环节（写 → 存 → 发）均有恰当防护：

- 写入：事务原子性 + event_id 幂等 ✓
- 存储：At-least-once via compensation scanner ✓
- 发布：LISTEN/NOTIFY + 补偿扫描器 ✓

**残留风险**（均为低风险/设计接受）：

1. **重复处理**：OutboxPublisher 在 `routeEvent` 成功后、`UPDATE processed_at` 前崩溃，同一事件可能被处理两次（at-least-once 语义，无 exactly-once 保证）
2. **`auditLog.ts` 独立模式**：不使用 event_id，无法去重

---

## Q5: 跨服务类型转换有无信息丢失？

### 证据

**前端→Node API (JSON)**：

- `buildBacktestRequestBody` (backtestStore.ts L124-141)：`JSON.stringify` 发送
  - `number` 类型（weight, drag, startingValue）：直接传递
  - `string` 类型（ticker, date, rebalanceFrequency）：直接传递
  - `boolean` 类型（totalReturn, isGlidepath, adjustForInflation）：直接传递

**Node API→Go Engine (JSON)**：

- `engineBodyBuilder.ts:buildEnginePortfolioBody` (L22-40)：
  - `rebalanceBands`：仅在 `enabled===true` 时发送 `{ absolute, relative }`
  - `glidepathToWeights`/`glidepathYears`：仅在 `isGlidepath===true` 时发送
  - 其他字段直通
- `engineBodyBuilder.ts:buildEngineParams` (L55-71)：
  - `startingValue`：默认值 `10000`（L64），防止 `undefined` 被 JSON.stringify 丢弃导致 Go 反序列化 "missing field"
  - 类似默认值：`adjustForInflation: false`, `rollingWindowMonths: 12`, `benchmarkTicker: ''`
- `engineClient.ts:callGoEngine` (L47-65)：`JSON.stringify(body)` + HTTP POST
- 关键代码注释L57-60：文档了 Go 引擎要求必填字段的历史问题

**Go Engine→Node API (JSON)**：

- `callGoEngine` 返回 `result` 经 `JSON.parse`（由 `httpClient.ts` 的 `resp.json()` 隐式完成）
- `backtest-service.ts` 的引擎响应类型断言 (L155)：`callEngineStrict<BacktestResult>(...)` — 直接类型断言，无运行时校验

**Node API→前端 (JSON)**：

- `compressBacktestResult.ts:compressBacktestResultForSync` (L107-115)：
  - 降采样曲线到 400 点
  - `omitPortfolioFields`：删除 `allocationHistory`、`drawdownEpisodes`、`rollingReturns`
  - 这些字段通过 `/portfolio/series` 端点补全（从 LRU cache 读取并降采样）
- `normalizeBacktestResult` (backtestStore.ts L100-121)：
  - 补齐缺失数组字段默认值：`growthCurve: []`, `drawdownCurve: []`, `annualReturns: []` 等
  - `statistics: p.statistics ?? emptyStats`
  - 防止图表组件 `.map` 崩溃

**Node API→Go 数据服务 (JSON)**：

- `dataRoutes.ts:convertPricePointsToMap` (L92-104)：
  - Go → `{ date: string, open, high, low, close, adj_close }` → Node
  - `map[point.date] = point.adj_close ?? point.close`
- `dataQueryService.ts:queryPricesFromDb` (L148-149)：`date.toISOString().slice(0, 10)`

**类型转换风险分析**：

| 类型           | 场景                                | 处理                                                    | 风险等级                          |
| -------------- | ----------------------------------- | ------------------------------------------------------- | --------------------------------- |
| `NaN`          | 统计指标（sharpe=NaN 当无风险资产） | Go `json.Marshal` 对 NaN 报错 → HTTP 500                | **中**                            |
| `Infinity`     | 极端收益计算                        | 同上                                                    | **低**                            |
| `undefined`    | 可选参数未传                        | `JSON.stringify` 丢弃该键 → Go 反序列化 "missing field" | ✅ `buildEngineParams` 已设默认值 |
| `Decimal`      | 高精度计算                          | JSON/JavaScript number（IEEE 754 双精度）               | ✅ 15年回测金额 < 2^53            |
| `Date`         | 日期字段                            | 统一 `YYYY-MM-DD` 字符串格式                            | ✅ 一致                           |
| 大整数 (>2^53) | 累积收益                            | 精度丢失，但实际回测数字 < 10^7                         | ✅ 安全                           |
| `bigint`       | PostgreSQL NUMERIC                  | pg 驱动返回 JS number                                   | ⚠️ 大精度数值可能近似             |
| null           | statistics 中的空值                 | `normalizeBacktestResult` 补齐默认                      | ✅                                |

**`normalizeBacktestResult` 的防御性处理** (backtestStore.ts L100-121)：

- `raw` 类型不匹配时兜底为空对象
- 数组字段默认 `[]`
- statistics 默认 `{}`
- 此函数位于**前端**，作为最后一道防线

### 分析

`buildEngineParams` 的默认值补齐（L63-71）是重要的修复 — 注释中记录了前端可选字段被 JSON.stringify 丢弃后 Go 引擎反序列化报 "missing field" 的问题。

**NaN/Infinity 风险详情**：

Go 的 `encoding/json` 标准库遇到 `float64` 的 `NaN`、`+Inf`、`-Inf` 时会返回 `json.ErrUnsupportedValue`。这意味着如果 Go 引擎的某个统计计算产生 NaN（例如标准差为 0 时的 Sharpe 比率），`json.Marshal` 会失败，表现为 Go 引擎返回 500 错误。Node API 侧无法区分"引擎计算错误"和"JSON 序列化 NaN 错误"。

解决方案（如果 Go 引擎尚未处理）：Go 引擎应使用 `json.Encoder` 的 `SetEscapeHTML(false)` 配合自定义 `json.Marshaler`，或者在后处理中替换 NaN 为 `0` 或 `null`。

**类型断言的隐式风险**：

`backtest-service.ts` L155 使用 `callEngineStrict<BacktestResult>` 类型断言（`result as T`），没有使用 Zod 或类似运行时的契约校验。如果 Go 引擎的响应格式与 TypeScript 的 `BacktestResult` 接口不一致（字段重命名、类型变更），会静默传播到前端。这是一个**低风险但持续存在的类型差距**，此前已有 `assets`→`tickers` 字段重命名的先例（`backtestRoutes.ts:analysis` L338-344 的手动映射）。

### 结论

⚠️ **大部分安全，存在2个具体问题**：

1. **NaN/Infinity 序列化风险**（中等）：Go 引擎若产生 NaN 统计值，`json.Marshal` 会返回 500，Node API 无法区分此错误。建议在 Go 引擎的输出层增加 NaN→null 转换，或在 Node 侧对 Go 引擎响应做 JSON 反序列化的 NaN 容忍处理。

2. **Go→Node 响应无运行时校验**（低）：`callEngineStrict<T>` 直接类型断言，无 Zod schema 验证。此前已有 `assets`→`tickers` 字段映射的工作区。建议对关键响应（至少 `BacktestResult`）增加运行时校验。

3. ✅ 日期序列化一致、Decimal 精度安全、undefined 通过默认值补齐。
