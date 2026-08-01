# Application 层契约

本目录承载 **application service**：编排领域逻辑与 I/O 的业务流程。
依赖方向：`application → domain`（单向），domain 层不得被 application import。

## 核心契约

### 1. 必须经 domain 聚合根或纯函数

涉及业务不变量（权重和、ticker 净化、再平衡判断）时，**必须**经聚合根（`Portfolio.fromDTO()` / `Portfolio.create()`）或 domain 纯函数（`domain/services/` 的 `grid-search` / `optimizer-domain`）执行，不得在 application 层重新实现领域校验。

- ✅ `backtest-service.ts`：`portfolios.map((p) => translateDomainError(() => DomainPortfolio.fromDTO(p)))`
- ✅ `optimize-service.ts`：调用 `optimizer-domain.ts` 的 `buildCombinations` / `filterByConstraints`
- ❌ 手写 `if (sum(weights) !== 100) throw ...`

### 2. 纯透传到 repo 是禁止的

仅转发参数的 service 不应存在——**routes 直连 repo**（薄路由）。

- ✅ `routes/workspaceRoutes.ts` 直接 import `repositories/portfolioRepo.ts` CRUD（合并自 portfolio/config/run 三文件）
- ❌ `portfolio-application-service.ts`（已删除）仅 5 个纯转发函数

### 3. 纯 fetch-and-call-engine 的编排器 → `services/*Orchestrator`

只做"获取数据 + 调引擎"、不涉及 domain 的模块改名 `*Orchestrator` 放 `packages/backend/src/services/`。

- ✅ `services/analysis-orchestrator.ts`（PCA/LETF/GoalOptimizer/单资产）、`signal-orchestrator.ts`（信号分析）
- ❌ 上述曾命名 `application/*-service.ts`（Task 2.5 已迁移）

### 4. domain 异常翻译

domain 抛 `DomainValidationError`（`domain/errors.ts`，无 HTTP 语义）；application 经 `translateDomainError()`（`backtest-helpers.ts`）翻译为 `ValidationError`（HTTP 422），路由层 `asyncRouteHandler` 统一处理。
domain 层**不得** import `utils/errors.js`（反向依赖）。

## 目录结构

```
application/   backtest/montecarlo/optimize/tactical/grid service + backtest-helpers + backtest/ 工具
services/      analysis/signal orchestrator + loginLockout/usageService/billingService 等
domain/        aggregates/ value-objects/ services/ events/ errors.ts
```
