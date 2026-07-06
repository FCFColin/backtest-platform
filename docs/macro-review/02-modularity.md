# 切片02：模块化程度

## Q1: 3 个包的边界划分是否合理？

### 证据

1. **shared/types/ 目录结构** — 10 个接口文件按领域拆分：
   - `portfolio.ts` (组合/再平衡/现金流), `backtest.ts` (回测参数/结果), `statistics.ts` (60+统计指标), `monte-carlo.ts`, `optimizer.ts`, `tactical.ts`, `signal.ts`, `pca.ts`, `letf.ts`, `goal.ts`
   - 另有 `constants.ts` (4 个常量)、`types.ts` (barrel re-export)、`types/index.ts` (barrel)

2. **非类型代码入侵情况**：
   - `statistics.ts:185` — `createEmptyStatistics()` 是工厂函数（非类型），显式注释 `T-24：消除重复的空统计对象字面量`。该函数被 backend 引擎代码 (`packages/backend/src/engine/tactical.ts:26`) 导入使用。
   - `types/index.ts:14` — barrel 导出 `CHART_COLORS` 常量，跨越类型/常量边界。
   - `constants.ts` — 仅含 `MAX_TICKERS`、`TRADING_DAYS_PER_YEAR`、`TRADING_DAYS_PER_YEAR_US`、`CHART_COLORS`，全部为纯常量，无逻辑代码。

3. **shared/package.json** — 只有 `typescript` 作为 devDependency，零运行时依赖。✓

4. **导入模式** (grep `from '@backtest/shared'`)：
   - **Frontend**: 60+ 处导入，绝大多数为 `import type`。仅 `CHART_COLORS` 以值（非 type-only）导入。导入分布在 pages/components/store/utils 层，集中在类型消费。无一致性偏离。
   - **Backend**: 44 处导入，其中 `createEmptyStatistics` 在 `tactical.ts` 中以值导入，`MAX_TICKERS` 和 `TRADING_DAYS_PER_YEAR` 以常量导入。Backend 的 engine 层（尽管是降级引擎）直接消费 shared 类型——这是合理的，因为 shared 类型的定义者也是 engine 的输出契约。

5. **frontend ↔ backend 交叉引用**：frontend 从不直接 import backend，backend 从不 import frontend。包边界严格遵守 `frontend → shared`、`backend → shared` 的单向依赖。

### 分析

- **包边界定义**：frontend (React UI)、backend (Express API)、shared (类型契约) 的三分结构是 monorepo 标准实践。包间依赖方向正确。
- **非类型入侵**：`createEmptyStatistics()` 是 shared 中唯一的非类型代码。它的存在有合理动机（消除重复占位对象），但违反了"shared 只放类型"的最初约定。备选方案：放在 backend 的 `engine/` 或 `utils/` 层。目前仅 backend 使用它，frontend 不依赖此函数。
- **CHART_COLORS 常量**：通过 types barrel 导出，被 35+ 个 frontend 组件以值导入。这违反了"类型 barrel 不应导出具名值"的常见约定。应当通过 `shared/constants` 路径导入。
- **统计相似性**：frontend 和 backend 都大量导入 `RebalanceFrequency`、`Statistics`、`PortfolioResult` 等类型——这是正常的：shared 的存在意义正是让 frontend 和 backend 共享相同的类型语言。没有出现"多个包都大量导入某个 shared 模块但互不相关"的异常信号。

### 结论

**change / keep** — 边界划分基本合理，但有 2 处具体问题需修复：

1. `createEmptyStatistics()` 应迁移到 backend 域（shared 仅保留类型工厂的接口签名，实现下沉到 backend `utils/`）。
2. `CHART_COLORS` 应通过 `@backtest/shared/constants` 路径导入，而非通过 types barrel 暴露。

不视为 dumping ground：shared 的职责明确在"类型契约"，非常住逻辑入侵仅 1 例（`createEmptyStatistics`），且已有注释承认这是 pragmatism。

---

## Q2: 前端 24 页面按 backtest/analysis/account 子目录聚合是否正交？

### 证据

1. **pages/ 目录结构**：
   - `backtest/` (4)：BacktestPage, BacktestOptimizerPage, MonteCarloPage, RebalancingSensitivityPage
   - `analysis/` (4)：AnalysisPage, EfficientFrontierPage, FactorRegressionPage, PCAPage
   - `account/` (3)：AccountPage, BillingPage, OrgMembersPage
   - `admin/` (4)：AdminDashboard, DataManagement, SystemMonitor, SystemSettings
   - 根目录 (14)：About, AcceptInvite, Calculators, Changelog, Contact, DataEngine, DualSignal, GoalOptimizer, Help, LETFSlippage, Login, LumpSumVsDCA, MultiSignal, Optimizer, Pricing, SignalAnalyzer, Signup, Tactical, TacticalGrid, VerifyEmail

2. **子目录间交叉引用**：零处。grep 检查 `pages/` 下各子目录无跨子目录 import。

3. **子目录内部分享的数据流模式**：
   - `backtest/` 页面共享 `useBacktestPageState` / `useBacktestOptimizerState` hook，都通过 `backtestStore` 管理状态。
   - `analysis/` 页面各自使用独立 store (`usePCAState`, `useEfficientFrontierState`)，无共享 hook。
   - `account/` 页面通过 auth/org/billing service 直接读取数据，无统一 store。
   - `admin/` 页面直接查询 data-manage / admin API，类似 account。

4. **根目录页面与子目录页面的正交性**：
   - `DualSignalPage` / `MultiSignalPage` 本质上是 signal analysis 的变体，但与 `SignalAnalyzerPage`（也在根目录）同属信号分析域，却未归入 `analysis/`。
   - `OptimizerPage` 属于组合优化，但留在根目录而非 `backtest/`。
   - `GoalOptimizerPage` 与 `TacticalPage` / `TacticalGridPage` 是策略类页面，但全部在根目录。

### 分析

- **子目录划分的聚合粒度**：backtest/ 和 analysis/ 的划分是正交的（回测执行 vs 资产分析），account/ 和管理/ 也是正交的（用户管理 vs 系统运维）。
- **根目录页面的"游荡"问题**：22 个页面中 14 个（64%）在根目录。这些页面不共享统一的子目录分组逻辑。有些按功能领域（signal analyzer、dual signal 同属 signal domain）但散落在根目录。
- **数据流模式不一致**：backtest/ 页面共享 store 模式，analysis/ 页面各用独立 store，account/admin 页面直接调用 service——这意味着离开 backtest 子目录后，数据流模式逐渐消散，没有统一的前端分层约定。
- **跨子目录 import 不存在** → 没有剪不断理还乱的依赖。这是好信号。

### 结论

**investigate further** — 子目录聚合本身正交且无越界 import。问题在于 64% 页面残留在根目录：

- DualSignalPage / MultiSignalPage 应随 SignalAnalyzerPage 一起迁入 `analysis/`
- OptimizerPage 可归入 `backtest/`
- GoalOptimizerPage / TacticalPage / TacticalGridPage 可归入新的 `tactical/` 或 `strategy/` 子目录
- LoginPage / SignupPage / VerifyEmailPage 可归入 `auth/` 子目录

建议建立清晰的 6 子目录分组：`backtest/` `analysis/` `strategy/` `auth/` `account/` `admin/`，将所有 22 页面归入。

---

## Q3: 后端 20 个路由组职责有无重叠？

### 证据

1. **22 个 route 文件 + 1 个 register.ts 挂载器**，挂载 20 组 v1 路由（含 healthRoutes/debugRoutes）。对照路 route 表（inspection-task2-architecture.md §2）：

2. **路由职责审查**（按文件）：

| 文件                      | 前缀                         | 端点                                                                   | 职责                                                                     |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `backtestRoutes`          | `/api/v1/backtest`           | portfolio, analysis, monte-carlo, optimize, efficient-frontier, search | **复合路由**：portfolios回测 + 资产分析 + 蒙特卡洛 + 组合优化 + 有效前沿 |
| `backtestOptimizerRoutes` | `/api/v1/backtest-optimizer` | optimize (async + sync fallback)                                       | 参数空间遍历优化                                                         |
| `tacticalRoutes`          | `/api/v1/tactical`           | backtest, what-if, alerts                                              | 战术分配回测                                                             |
| `tacticalGridRoutes`      | `/api/v1/tactical-grid`      | search                                                                 | 战术参数网格搜索                                                         |
| `signalRoutes`            | `/api/v1/signal`             | analyze, dual, multi                                                   | 技术指标信号分析                                                         |
| `goalOptimizerRoutes`     | `/api/v1/goal-optimizer`     | optimize                                                               | 目标导向优化                                                             |
| `pcaRoutes`               | `/api/v1/pca`                | analyze                                                                | PCA 主成分分析                                                           |
| `letfRoutes`              | `/api/v1/letf`               | analyze                                                                | 杠杆ETF滑点分析                                                          |
| `dataRoutes`              | `/api/v1/data`               | history, search, cpi                                                   | **只读数据查询**                                                         |
| `dataManageRoutes`        | `/api/v1/data/manage`        | status, stats, tickers, search, update                                 | **数据管理及运维**                                                       |
| `portfolioRoutes`         | `/api/v1/portfolios`         | CRUD                                                                   | **持久化组合 CRUD**                                                      |
| `configRoutes`            | `/api/v1/configs`            | CRUD                                                                   | **命名配置 CRUD**                                                        |
| `runRoutes`               | `/api/v1/runs`               | CRUD                                                                   | **回测历史 CRUD**                                                        |
| `authRoutes`              | `/api/v1/auth`               | login, register, refresh, logout, me, switch-org, orgs                 | 认证/注册/组织切换                                                       |
| `apiKeyRoutes`            | `/api/v1/keys`               | CRUD                                                                   | 组织 API 密钥管理                                                        |
| `orgRoutes`               | `/api/v1/orgs`               | current, members, invitations                                          | 组织管理及成员                                                           |
| `billingRoutes`           | `/api/v1/billing`            | subscription, checkout, portal, webhook                                | Stripe 计费                                                              |
| `adminRoutes`             | `/api/v1/admin`              | stats, system                                                          | 管理仪表盘                                                               |
| `jobRoutes`               | `/api/v1`                    | GET /jobs/:id                                                          | 异步任务状态                                                             |
| `debugRoutes`             | `/api/v1`                    | GET /debug/health                                                      | 调试探针                                                                 |
| `healthRoutes`            | `/api`                       | health, ready, metrics                                                 | 健康检查/指标（非 v1）                                                   |

3. **职责重叠检测**：

   - **`backtestRoutes.ts` 的高耦合**：该文件处理 5 种完全不同的计算类型（portfolio backtest, analysis, monte-carlo, optimize, efficient-frontier）。其中 analysis、optimize、efficient-frontier 在 Go 引擎中有独立的 handler（`server/router.go`），但在 Node API 层被塞入同一个路由文件。这与 `backtestOptimizerRoutes.ts`（仅做参数空间遍历优化）的命名有语义重叠——`/api/v1/backtest/optimize` 和 `/api/v1/backtest-optimizer/optimize` 都包含"优化"概念，但前者是单次优化（权重搜索），后者是参数空间遍历。

   - **`backtestRoutes.ts` 与 `pcaRoutes.ts` / `letfRoutes.ts` 的不一致**：`/api/v1/backtest/analysis` 做资产分析，而 `/api/v1/pca/analyze` 做 PCA，`/api/v1/letf/analyze` 做 LETF 滑点——这三者都是分析类计算。为什么 2 个独立成路由而 1 个嵌套在 backtest 下？考虑到 inspection-task2 的结构已经存在，且 `pcaRoutes` 和 `letfRoutes` 有独立的权限需求（使用 `computeAuth` 中间件），拆分是合理的。但`backtestRoutes` 中的 `analysis` 端点应同样拆出。

   - **CRUD 模板化**：`portfolioRoutes.ts` (131行)、`configRoutes.ts` (127行)、`runRoutes.ts` (100行) ——三个文件的结构完全一致（list/get/create/delete、UUID_RE、ownerOf、相同的错误处理模板）。这是 CTRL+C/V 模式。虽然不是"职责重叠"，但表明基础设施层缺少抽象。

   - **`healthRoutes.ts` 的特殊性**：用 `/api/health`（非 v1）路径。这与整体 API 版本化方案不一致（虽然 health 端点可以豁免版本化）。

4. **中间件链的一致性**：register.ts 中所有 compute 端点都有完整的 计算认证 → 租户解析 → 权限校验 → 配额检查 → 审计日志 链（8 组），非 compute 端点有不同的组合。中间件链无冗余或缺失。

### 分析

- **语义重叠但不冲突**：`/api/v1/backtest/optimize` 和 `/api/v1/backtest-optimizer/optimize` 是有区别的——前者是简单权重优化，后者是参数空间遍历。名称虽相似，职责不同。
- **"假大文件"问题**：`backtestRoutes.ts` (503 行) 是 5 种计算类型的合集。它应该有文件级拆分——当前已将大部分计算逻辑下沉到 application service（`backtest-service.ts`）和 engine（`callEngineStrict`），但路由文件本身仍显臃肿。建议将 `/portfolio`、`/analysis`、`/monte-carlo`、`/optimize`、`/efficient-frontier` 拆分为独立文件，或至少在同一个文件中用清晰的节（section）分隔。
- **CRUD 模板重复**：portfolios/runs/configs 三个 CRUD 路由的高度同构是系统性的基础设施抽象不足信号。

### 结论

**change** — 路由组之间无实质性职责重叠（各自对应不同资源或计算类型）。但存在 3 个问题：

1. `backtestRoutes.ts` 在一个文件中处理 5 种计算职责，建议拆分为 `portfolioBacktestRoutes.ts`、`analysisRoutes.ts`、`monteCarloRoutes.ts`、`backtestOptimizeRoutes.ts`、`efficientFrontierRoutes.ts`（或至少提取 2-3 个独立文件）。
2. 三个 CRUD 路由（portfolio/configs/runs）的结构重复提示需要 CRUD 基础设施抽象（如泛型 base router）。
3. `backtestRoutes` 中的 `/analysis` 端点与 `pcaRoutes` / `letfRoutes` 的拆分逻辑不一致。如果 PCA/LETF 单独成路由，analysis 也应单独成路由。

---

## Q4: DDD 分层 3 处应用层违规是例外还是系统性退化信号？

### 证据

1. **已有自检结果**（`inspection-task2-architecture.md` §1）确认 3 处违规，均为 LOW severity：

| 文件                               | 违规 import                                                             | 行号 |
| ---------------------------------- | ----------------------------------------------------------------------- | ---- |
| `backtest-service.ts`              | `import { writeEventInTransaction } from '../services/outboxWriter.js'` | 12   |
| `grid-application-service.ts`      | `import { fetchHistoryData } from '../services/dataService.js'`         | 4    |
| `optimizer-application-service.ts` | `import { fetchHistoryData } from '../services/dataService.js'`         | 6    |

2. **所有 8 个 application 文件 import 审计**（本次验证）：

| 文件                               | import 来源                                                                                                                                  | 是否违规                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `analytics-application-service.ts` | `../engine/pca.js`, `../engine/letf.js`, `../engine/goalOptimizer.js`, `../engine/seriesUtils.js`                                            | ✅ 无（engine 是领域层）   |
| `backtest-query-service.ts`        | `@backtest/shared/types`, `@backtest/shared/constants`, `../utils/dateUtils.js`                                                              | ✅ 无                      |
| `backtest-service.ts`              | `../engine/portfolio.js`, `../utils/engineClient.js`, `../domain/events/`, `../db/index.js`, **`../services/outboxWriter.js`**, shared types | ⚠️ outboxWriter (services) |
| `cqrs.ts`                          | 无 import（纯接口定义）                                                                                                                      | ✅ 无                      |
| `grid-application-service.ts`      | **`../services/dataService.js`**, `../utils/logger.js`, `../utils/logSanitizer.js`, `../engine/tacticalGrid.js`                              | ⚠️ dataService (services)  |
| `optimizer-application-service.ts` | **`../services/dataService.js`**, `../engine/portfolio.js`, `../utils/logger.js`, `../utils/numericRange.js`, shared types                   | ⚠️ dataService (services)  |
| `signal-application-service.ts`    | `../engine/seriesUtils.js`, `../engine/signal.js`                                                                                            | ✅ 无                      |
| `tactical-application-service.ts`  | `../engine/tactical.js`, `../engine/portfolio.js`, `../utils/logger.js`                                                                      | ✅ 无                      |

3. **Domain 层纯净性**（`packages/backend/src/domain/`）：
   - `aggregates/` (portfolio.ts) — 仅 import value objects ✓
   - `events/` (5 files) — 零基础设施 import ✓
   - `value-objects/` (5 files) — 纯数据结构 ✓
   - `logger.ts` — `DomainLogger` 接口定义 ✓
   - 零 import 来自 `services/`、`db/`、`middleware/`、`routes/`

4. **违规代码的显式注释**：
   - `backtest-service.ts:12` — `// DDD pragmatism: outboxWriter is an infrastructure concern, imported directly as service.`
   - `grid-application-service.ts:3-6` — `// @note DDD pragmatism: imports fetchHistoryData directly from services layer instead of through a repository interface.`
   - `optimizer-application-service.ts:3-5` — `// @note DDD pragmatism: imports fetchHistoryData directly from services.`

5. **新增隐式违规**：本次审计未发现任何新的应用层→基础设施隐式违规。3 处违规全部在已有自检报告中标注，且都有注释承认。

### 分析

- **3 处违规的根因相同**：应用层需要数据获取能力，但设计未抽象 DataServicePort/OutboxPort 接口。当前先 pragmatism（直接 import）后抽象——这是合理的工程折衷，因为抽象接口需要额外的代码和间接层，对于 MVP/早期产品代价可接受。
- **是否系统性退化**：否。3 处违规集中暴露相同问题（缺少数据服务端口抽象），而非分布在不同的基础设施类型。Domain 层干净，无违规传染。代码注释都包含 `DDD pragmatism` 标识，说明团队自觉且有计划修复。
- **修复优先级**：低。不影响正确性。建议在新增第四个 dataService import 时一并引入 `DataServicePort` 接口。

### 结论

**keep (with monitoring)** — 3 处违规是设计 pragmatism 的集中表现，而非系统性退化信号。domain 层纯净。建议：

1. 记录为已知 DDD pragmatism debt，与 ADR-013 对齐。
2. 当需要第 4 处 application→services import 时强制执行端口抽象。
3. 当前不要求立即修复。

---

## Q5: Go 引擎包划分是否覆盖所有职责？

### 证据

1. **`engine-go/internal/` 目录结构**（7 个包）：

| 包               | 文件数 | 行数估计 | 测试文件                                  | 职责                                           |
| ---------------- | ------ | -------- | ----------------------------------------- | ---------------------------------------------- |
| `engine/`        | 8      | ~1200    | `backtest_test.go`, `fingerprint_test.go` | 核心回测引擎：净值计算、统计指标、回撤、再平衡 |
| `montecarlo/`    | 2      | ~905     | `montecarlo_test.go`                      | 蒙特卡洛模拟（块自助法 + 并行 goroutine）      |
| `optimizer/`     | 2      | ~1072    | `optimizer_test.go`                       | 投资组合优化（闭式解 + 随机搜索 + 有效前沿）   |
| `middleware/`    | 4      | ~200     | `auth_test.go`                            | HTTP 中间件（安全头、限流、引擎认证）          |
| `analysis/`      | 1      | 355      | 无                                        | 单资产分析（复用 engine 包统计函数）           |
| `observability/` | 1      | 80       | 无                                        | OpenTelemetry + Prometheus 注册                |
| `server/`        | 1      | 239      | 无                                        | Gin HTTP 路由 + 处理器                         |

2. **零测试包分析**：

   - **`analysis/`**：
     - 清晰职责：`RunAnalysis()` 对多个 ticker 执行单资产分析（净值曲线、回撤、统计指标、相关性矩阵）。
     - 代码质量：355 行，函数命名明确，JSDoc（Go comment）完整，复用了 `engine` 包的 Calc* 函数。
     - 是否有测试：无。但这主要是一系列 `engine` 包函数的编排调用——测试 `RunAnalysis` 需要 mock priceData 和黄金数据。

   - **`observability/`**：
     - 清晰职责：`Init()` 初始化 TracerProvider 和 Prometheus Registry，`MustInit()` 的宽松包装。
     - 80 行，几乎全是 OTel/Prometheus boilerplate 初始化。对这类基础设施代码编写单元测试的 ROI 低（涉及外部依赖和全局状态）。集成测试更适合但需 OTel collector。

   - **`server/`**：
     - 清晰职责：Gin 路由注册 + HTTP handler（反序列化后委托给 engine/montecarlo/optimizer/analysis 包）。
     - 239 行，handler 函数是 20-30 行的薄委托层（ShouldBindJSON → domain call → JSON response）。
     - 测试这些 handler 需要 Gin 测试框架（httptest）。难度不高但需投入。

3. **Go test 文件分布**：5 个测试文件集中在内核计算包（engine、montecarlo、optimizer）和基础设施包（middleware）。表明团队测试策略是"核心计算优先"——这是合理的。

### 分析

- **包划分覆盖率**：7 个包涵盖了 Go 引擎的全部职责：路由暴露（server）、安全/限流（middleware）、回测计算（engine）、蒙特卡洛（montecarlo）、优化（optimizer）、分析（analysis）、可观测性（observability）。无遗漏。
- **包间依赖方向正确**：server → (engine, montecarlo, optimizer, analysis, middleware)；engine 是最底层计算包，无反向依赖。✓
- **零测试的根因**：三个零测试包对应的是"编排/初始化"而非"核心计算"：
  - `analysis` 包内在逻辑有限（主要是 engine 函数的编排），核心计算在 engine 包已有测试覆盖。
  - `observability` 是基础设施 boilerplate。
  - `server` 是 HTTP 薄委托层。
  - 这不是分工不清，而是团队有意识的选择（先测核心计算，后测编排层）。
- **是否需要合并**：不需要。各包职责独立清晰。如果将分析放入 engine 包，engine 包将膨胀到 1500+ 行。将其独立为 analysis 包是对的。

### 结论

**keep** — 包划分完整且合理。零测试的 3 个包（analysis/observability/server）职责各自清晰，分别是编排层、基础设施层和 HTTP 适配层。建议：

1. `analysis` 包应当补充测试（特别是 `RunAnalysis` 和辅助函数 `getSortedDates`、`filterDates`、`extractPrices`），因为它包含非纯编排逻辑（日期过滤、价格提取、相关性矩阵构建）。
2. `server` 包的 handler 可以补充集成测试（用 `httptest` 模拟请求），但优先级低于 analysis。
3. `observability` 包的测试优先级最低（boilerplate 初始化代码）。

---

## 综合模块化评估

| 维度               | 评估                                                                   | 优先级 |
| ------------------ | ---------------------------------------------------------------------- | ------ |
| Q1: shared 包边界  | ✅ 基本合理，2 处小瑕疵（createEmptyStatistics、CHART_COLORS barrel）  | P3     |
| Q2: 前端页面正交性 | ⚠️ 子目录正交但 64% 页面在根目录，需要完整子目录规划                   | P2     |
| Q3: 后端路由职责   | ⚠️ 无重叠但 `backtestRoutes.ts` 复合度高（5 合一）+ 3 个 CRUD 模板重复 | P2     |
| Q4: DDD 分层违规   | ✅ 3 处 LOW pragmatism，非系统性退化，domain 层纯净                    | P4     |
| Q5: Go 引擎包划分  | ✅ 完整覆盖，零测试是顺序问题非分工问题                                | P3     |

**全局风险判断**：模块化程度中等偏上。pnpm workspace 拆分刚完成，包边界和分层方向正确。存量问题集中在"已拆分但未完成细化"（根目录页面、复合路由文件、缺少类型端口抽象），而非已有结构崩溃。
