# Application 层契约

本目录承载 **application service**：编排领域逻辑与 I/O 的业务流程。
依赖方向：`application → domain`（单向）。application 层不得被 domain 层 import。

## 核心契约

### 1. 必须经 domain 聚合根或纯函数

application service 若涉及业务不变量（权重和、ticker 净化、再平衡判断等），
**必须**通过 domain 聚合根（`Portfolio.fromDTO()` / `Portfolio.create()`）或
domain 纯函数（`domain/services/` 下的 `grid-search` / `optimizer-domain`）执行，
不得在 application 层重新实现领域校验。

- ✅ `backtest-service.ts`：`portfolios.map((p) => translateDomainError(() => DomainPortfolio.fromDTO(p)))`
- ✅ `optimize-service.ts`：调用 `domain/services/optimizer-domain.ts` 的 `buildCombinations` / `filterByConstraints`
- ❌ 在 application 层手写 `if (sum(weights) !== 100) throw ...`

### 2. 纯透传到 repo 是禁止的

若一个 "service" 函数只是把参数原样转发给 repository，没有领域校验或跨 repo 编排，
它不应存在 —— **routes 直连 repo**（薄路由模式）。

- ✅ `routes/portfolioRoutes.ts` 直接 import `repositories/portfolioRepo.ts` 的 CRUD 函数
- ❌ `portfolio-application-service.ts`（已在 Task 2.1 删除）仅 5 个纯转发函数

### 3. 纯 fetch-and-call-engine 的编排器 → `services/*Orchestrator`

若一个模块只做"获取数据 + 调引擎"，不涉及 domain 聚合根或 domain 纯函数，
应改名 `*Orchestrator` 并放在 `packages/backend/src/services/`，
与涉及 domain 的 application service 区分。

- ✅ `services/analysis-orchestrator.ts`：fetch history + callEngineStrict（PCA/LETF/GoalOptimizer/单资产分析）
- ✅ `services/signal-orchestrator.ts`：fetch history + callEngineStrict（信号分析）
- ❌ 上述文件放在 `application/` 且命名 `*-service.ts`（已在 Task 2.5 改名迁移）

### 4. domain 异常翻译

domain 层抛出 `DomainValidationError`（`domain/errors.ts`，不含 HTTP 语义）。
application 层通过 `translateDomainError()`（`backtest-helpers.ts`）捕获并翻译为
`ValidationError`（HTTP 422），由路由层 `asyncRouteHandler` 统一处理。

- domain 层 **不得** import `utils/errors.js`（反向依赖）
- application 层 import 两个错误类型并翻译

## 目录结构

```
application/
├── backtest-service.ts          # 回测 application service（经 Portfolio 聚合根）
├── montecarlo-service.ts        # 蒙特卡洛 application service（经 Portfolio 聚合根）
├── optimize-service.ts          # 优化 application service（经 Portfolio + optimizer-domain）
├── tactical-application-service.ts  # 战术回测 application service（经 Portfolio 聚合根）
├── grid-application-service.ts  # 网格搜索 application service（经 grid-search 纯函数）
├── backtest-helpers.ts          # 共享工具 + translateDomainError 翻译辅助
└── backtest/                    # 回测专用工具（压缩/缓存/引擎体构建/价格数据）

services/                        # 纯编排器（无 domain 交互）+ 基础业务 service
├── analysis-orchestrator.ts     # 分析编排器（fetch + callEngine）
├── signal-orchestrator.ts       # 信号编排器（fetch + callEngine）
└── ...（loginLockout / usageService / billingService 等）

domain/
├── aggregates/                  # 聚合根（Portfolio 充血模型）
├── value-objects/               # 值对象（Ticker / Weight / Price / DateRange）
├── services/                    # 领域纯函数（grid-search / optimizer-domain）
├── events/                      # 领域事件
└── errors.ts                    # 领域异常（DomainValidationError）
```
