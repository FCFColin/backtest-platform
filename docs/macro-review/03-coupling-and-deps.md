# 切片03：耦合度与依赖合规

> 执行日期: 2026-07-06
> 调研范围: packages/backend, packages/frontend, packages/shared, engine-go

---

## Q1: 后端依赖方向是否正确？(domain → application → infrastructure → routes)

### 证据

**依赖方向定义**（来自 DDD 分层 + ADR-013）:

```
domain/ → application/ → services/ → routes/
                      ↗
           utils/ (工具层，可被任何层引用)
```

**Domain 层导入检查**（`packages/backend/src/domain/`，共 14 个文件）：

| 文件                                                  | 导入来源                                                         | 结论                        |
| ----------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| `domain/value-objects/*`                              | 仅域内互相引用                                                   | ✅ 纯净                     |
| `domain/aggregates/portfolio.ts`                      | `../value-objects/`                                              | ✅ 域内引用                 |
| `domain/events/EventDispatcher.ts`                    | `../logger.js`                                                   | ✅ 域内引用                 |
| `domain/events/index.ts`                              | `./value-objects/`, `./aggregates/`, `./events/`, `../logger.js` | ✅ 域内引用                 |
| `domain/events/handlers/RebalanceTriggeredHandler.ts` | `../../../utils/logger.js`, `../EventDispatcher.js`              | ❌ **违规** - 引用 `utils/` |
| `domain/events/handlers/BacktestCompletedHandler.ts`  | `../../../utils/logger.js`, `../EventDispatcher.js`              | ❌ **违规** - 引用 `utils/` |

**服务层导入检查**（`services/`，共 19 个文件）：

- 所有服务从 `utils/`, `db/`, `config/`, `domain/` 导入
- 没有任何服务从 `routes/` 导入
- ✅ 依赖方向正确，无逆向依赖

**路由层导入检查**（`routes/`，共 25+ 个文件）：

- 路由从 `services/`, `application/`, `utils/`, `middleware/`, `schemas/`, `config/`, `db/`, `domain/`, `queues/` 导入
- ⚠️ 部分路由直接导入 `db/`（如 `dataRoutes.ts` → `loadCpiSeriesFromDb`, `backtestRoutes.ts` → `loadCpiMapFromDb`）
  - 此为轻微违规：路由应通过服务层访问数据，而非直接调用 db 层
- 没有路由被其他层依赖（路由是拓扑终点层） ✅

**Application 层**（`application/`）：

- `backtest-service.ts`: 导入 `domain/`, `utils/`, `db/`, `services/`
- `optimizer-application-service.ts`: 导入 `services/`, `utils/`, `engine/`（Node 引擎）
- ⚠️ 注：`optimizer-application-service.ts` 导入 `../engine/portfolio.js`（Node 引擎），这是 ADR-008 中 "Node-canonical" 计算（非引擎降级），而是优化器自己用 Node 实现的组合回测

**`utils/` 层**：包含 `engineClient.ts`、`engineBodyBuilder.ts`、`backtestResultCache.ts` 等。其中 `engineClient.ts` 导入 `config/`、`utils/`、外部 `opossum`——无路由依赖。

### 分析

1. **Domain 层 2 处违规**：`handlers/RebalanceTriggeredHandler.ts` 和 `BacktestCompletedHandler.ts` 导入 `../../../utils/logger.js`。这些 handler 需要使用日志记录事件处理结果，但直接引用了基础设施层的 logger。应通过 `DomainLogger` 接口注入（已在 `domain/logger.ts` 中定义了类型但未被 handlers 使用）。

2. **路由→DB 直接访问**：3 个路由（backtestRoutes, dataRoutes, backtestOptimizerRoutes）直接调用 `db/` 中的函数而非通过服务层。这违反了 DDD 的分层原则，增加了耦合度。

3. `dependency-cruiser` 配置（`.dependency-cruiser.config.mjs`）定义了 5 条规则（domain-zero-deps, no-reverse-layer, utils-no-routes, frontend-no-backend, no-circular），但路径模式使用旧 `api/` 前缀，不匹配当前的 `packages/backend/src/` 结构，规则已全部失效。

### 结论

**有改善空间，但基本合规。** 2 处 domain 违规（handlers 引用 utils/logger）和 3 处路由直接访问 db/ 是已知的 DDD pragmatism，可通过 `DomainLogger` 接口注入修复。`dependency-cruiser` 配置需要更新路径以重新生效。**keep**（需要 minor fixes）。

---

## Q2: 有无循环依赖？

### 证据

**工具尝试**：

- `npx depcruise packages/backend/src/ --output-type err` — 超时（config 路径不匹配）
- `npx madge packages/backend/src/ --circular` — 超时
- `dependency-cruiser` config 中已定义 `no-circular` 规则但路径不匹配，不会触发

**手动分析**：
基于第 Q1 部分的 import 图谱分析，检查可能的循环路径：

```
domain/ → services/ (via outboxPublisher.ts → domain/events)
domain/ → application/ (via application/backtest-service.ts → domain/events)
application/ → services/ (via optimizer → services/dataService)
services/ → domain/ (via outboxPublisher → eventDispatcher)
routes/ → services/ → domain/ (合法流向)
routes/ → application/ → domain/ (合法流向)
routes/ → application/ → services/ (合法流向)
routes/ → queues/ → services/ (假设)
```

对 `services/` 目录的 grep 确认没有从 `services/` 导入 `routes/` 或 `application/` 的引用。

**检查 Domain↔Services 环**：

- `services/outboxPublisher.ts` 导入 `domain/events/`（合法：services 依赖 domain）
- domain 层不导入 services/ → 无环 ✅

**检查 Application↔Services 环**：

- `application/backtest-service.ts` 导入 `services/outboxWriter`（合法：application 依赖 services）
- services 不导入 application/ → 无环 ✅

### 分析

手动 import 分析未发现循环依赖。由于自动化工具因超时/配置不匹配未能运行，此结论基于 15 个 domain 文件、19 个 services 文件、25+ 个 routes 文件的 import 扫描。

### 结论

**未发现循环依赖。** 建议更新 `.dependency-cruiser.config.mjs` 中的路径以匹配 `packages/backend/src/` 结构，将 `no-circular` 规则重新投入自动化 CI。**keep**。

---

## Q3: pnpm workspace 跨包引用是否都走 workspace protocol？

### 证据

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'packages/*'
```

**packages 定义**（3 个包）:

| 包名                 | package.json name    |
| -------------------- | -------------------- |
| `packages/backend/`  | `@backtest/backend`  |
| `packages/frontend/` | `@backtest/frontend` |
| `packages/shared/`   | `@backtest/shared`   |

**跨包依赖声明**:

| 源包                 | 目标包             | 声明                                | 协议             |
| -------------------- | ------------------ | ----------------------------------- | ---------------- |
| `@backtest/backend`  | `@backtest/shared` | `"@backtest/shared": "workspace:*"` | ✅ `workspace:*` |
| `@backtest/frontend` | `@backtest/shared` | `"@backtest/shared": "workspace:*"` | ✅ `workspace:*` |
| `@backtest/shared`   | N/A                | 无依赖                              | ✅ 叶子包        |

**shared 包 exports 配置**（`packages/shared/package.json`）:

```json
{
  "exports": {
    ".": { "types": "./types/index.ts", "default": "./types/index.ts" },
    "./*": "./*",
    "./constants": "./constants.ts"
  }
}
```

**实际使用验证**：

- `packages/backend/src/routes/backtestRoutes.ts` 使用 `import type { Portfolio, BacktestParameters } from '@backtest/shared/types.js'` — 通过 workspace 解析 ✅
- `packages/frontend/src/store/backtestStore.ts` 使用 `import type { Portfolio, ... } from '@backtest/shared/types'` — 通过 workspace 解析 ✅
- `packages/backend/src/utils/engineBodyBuilder.ts` 使用 `import type { Portfolio, BacktestParameters } from '@backtest/shared/types.js'` — 通过 workspace 解析 ✅

### 分析

所有跨包引用一致使用 `workspace:*` protocol。没有发现 `"@backtest/backend": "1.2.3"` 或 `"@backtest/shared": "^0.1.0"` 之类的硬编码版本引用。pnpm workspace 的 `packages/*` 通配符覆盖了全部 3 个包。

### 结论

**完全合规。** pnpm workspace 配置正确，所有跨包引用使用 `workspace:*` protocol。**keep**。

---

## Q4: Go engine ↔ Node API 的 HTTP 接口契约有无正式定义？

### 证据

**Go 引擎暴露的端点**（`engine-go/internal/server/router.go`）:

| 端点                             | 方法 | 用途         | Node API 调用方                       |
| -------------------------------- | ---- | ------------ | ------------------------------------- |
| `/api/engine/backtest`           | POST | 组合回测     | `application/backtest-service.ts:155` |
| `/api/engine/analysis`           | POST | 单资产分析   | `routes/backtestRoutes.ts:336`        |
| `/api/engine/optimize`           | POST | 组合优化     | `routes/backtestRoutes.ts:448`        |
| `/api/engine/efficient-frontier` | POST | 有效前沿     | `routes/backtestRoutes.ts:490`        |
| `/api/engine/monte-carlo`        | POST | 蒙特卡洛模拟 | `routes/backtestRoutes.ts:392`        |
| `/api/engine/health`             | GET  | 健康检查     | 无（Go 进程自检）                     |

**Node API 调用方式**（`utils/engineClient.ts`）:

- 通过 `callEngineStrict(endpoint, body)` 发送 HTTP POST 到 `config.GO_ENGINE_URL`（默认 `127.0.0.1:5004`）
- 请求体由 `engineBodyBuilder.ts`（`buildEnginePortfolioBody`, `buildEngineParams`）基于前端传入的 TypeScript 类型手动构造
- 认证：`X-Engine-Auth` header（`config.ENGINE_AUTH_TOKEN`）

**OpenAPI 规范覆盖情况**（`docs/openapi.yaml`，3365 行）：

| OpenAPI 路径                   | Go 引擎对应                      | 覆盖                    |
| ------------------------------ | -------------------------------- | ----------------------- |
| `/backtest/portfolio`          | `/api/engine/backtest`           | ✅ 定义请求/响应 schema |
| `/backtest/analysis`           | `/api/engine/analysis`           | ✅ 定义请求/响应 schema |
| `/backtest/optimize`           | `/api/engine/optimize`           | ✅ 定义请求/响应 schema |
| `/backtest/efficient-frontier` | `/api/engine/efficient-frontier` | ✅ 定义请求/响应 schema |
| `/backtest/monte-carlo`        | `/api/engine/monte-carlo`        | ✅ 定义请求/响应 schema |
| `/backtest-optimizer/optimize` | N/A（Node canonical）            | ✅ 定义请求/响应 schema |

**缺失项**：

1. **OpenAPI 中未定义 Go 引擎的 HTTP 接口**：当前 OpenAPI 仅定义了前端 → Node API 的网关层契约（`/api/v1/backtest/*`），但 Node API → Go 引擎的 HTTP 调用（`/api/engine/*`）完全没有正式 schema 定义。
2. **`.dependency-cruiser.config.mjs` 仍引用旧路径**：`api/domain`, `api/services`, `api/utils`, `api/routes` — 不匹配当前 `packages/backend/src/` 结构。
3. **OpenAPI 中存在过时描述**：
   - `/backtest/portfolio` 描述："优先使用 **Rust** 引擎计算"（应改为 Go，ADR-008）
   - `/admin/stats` schema 中仍有 `rust_engine` 字段
4. **请求体构造缺乏跨服务验证**：Node 侧构造的引擎请求体（`engineBodyBuilder.ts`）与 Go 侧解析的 struct（`engine/types.go`）之间没有共享 schema 或类型定义——任何字段变更需要同时修改两侧代码，且无法在编译期发现不匹配。

### 分析

Go 引擎 ↔ Node API 的 HTTP 接口契约缺乏正式定义。这是当前架构中最大的耦合度风险：

- Node API 手动构造 JSON 请求体发送给 Go 引擎
- Go 引擎用 Gin 的 `ShouldBindJSON` 反序列化到本地 struct
- 两侧没有共享的 OpenAPI / protobuf / JSON Schema 定义
- 没有自动化测试验证 Node 输出与 Go 输入的结构兼容性

当前虽然有 5 个 Node 端点通过 `callEngineStrict` 调用 Go 引擎，但引擎内的 `backtest-optimizer` 不经过 Go——由 Node 的 `engine/portfolio.js` 直接计算（Node-canonical）。

### 结论

**存在显著缺口。** Go 引擎的 HTTP 接口（`/api/engine/*`）缺乏 OpenAPI schema 定义，也没有任何形式的跨服务契约。建议将 Go 引擎端点添加到 OpenAPI 规范中，或采用共享的 schema 生成（如 buf/connect 或 protobuf）来确保两侧的请求/响应结构一致。**investigate further**（需要确认是否引入 protobuf 或仅补充 OpenAPI）。

---

## Q5: 前端组件树有无跨层依赖？

### 证据

**前端源码结构**（`packages/frontend/src/`）:

```
pages/           → 页面组件（24 个页面）
components/      → UI 组件
store/           → Zustand 状态管理器（4 个 store）
hooks/           → 自定义 hooks
utils/           → 工具函数（apiClient, configApi 等）
lib/             → 第三方库配置
i18n/            → 国际化
```

**状态流向应该是**: Page → Store → API，即页面通过 store 访问数据，store 内部调用 API。

**实际 Import 扫描结果**:

```
pages/backtest/BacktestPage.tsx → @/store/backtestStore ✅ (page → store)
pages/LoginPage.tsx → @/store/authStore ✅ (page → store)
pages/account/AccountPage.tsx → @/store/authStore ✅ (page → store)
pages/account/BillingPage.tsx → @/store/authStore ✅ (page → store)
pages/account/OrgMembersPage.tsx → @/store/authStore ✅ (page → store)
pages/analysis/AnalysisPage.tsx → ../utils/apiClient ❌ (page → API 直接调用)
pages/admin/AdminDashboard.tsx → ../../utils/apiClient ❌ (page → API 直接调用)
pages/admin/DataManagement.tsx → ../../utils/apiClient ❌ (page → API 直接调用)
pages/admin/SystemMonitor.tsx → ../../utils/apiClient ❌ (page → API 直接调用)
pages/admin/SystemSettings.tsx → ../../utils/apiClient ❌ (page → API 直接调用)
pages/account/BillingPage.tsx → @/utils/apiClient ❌ (page → API 直接调用)
```

**详细违规清单**（page 直接调用 apiFetch，绕过 store 层）:

| 页面文件             | 调用的 API                                            |
| -------------------- | ----------------------------------------------------- |
| `AnalysisPage.tsx`   | `/api/backtest/analysis`                              |
| `AdminDashboard.tsx` | `/api/admin/stats`                                    |
| `DataManagement.tsx` | `/api/data/manage/stats`, `/api/data/manage/update/*` |
| `SystemMonitor.tsx`  | `/api/admin/stats`, `/api/admin/system`               |
| `SystemSettings.tsx` | `/api/admin/stats`, `/api/data/manage/update/refetch` |
| `BillingPage.tsx`    | `/api/v1/billing/*`                                   |

**补充说明**：

- `backtestStore.ts` 在 store 内部使用原生 `fetch()` 调用 API（非 `apiFetch`），虽不是通过 `apiClient`，但遵循了 page → store → API 模式 ✅
- `apiClient.ts` 自身是工具层，使用 store（`useDegradedStore`, `useToastStore`）来处理降级提示和错误 toast——这是合理的设计（工具层可调用 store）

### 分析

6 个页面/屏幕直接通过 `apiFetch` 调用后端 API，绕过了 Zustand store 层。其中 Admin 页面（AdminDashboard, DataManagement, SystemMonitor, SystemSettings）缺乏专用的 store，API 调用逻辑直接嵌入在页面组件中。`AnalysisPage` 也直接调用 `apiFetch`。

后端的 `engine/` 目录有 16 个 Node 引擎模块（backtestRunner, goalOptimizer, monteCarlo, optimizer, pca, signal, tactical, tacticalGrid 等），但这些是后端 Node-canonical 计算模块，与前端无关。

### 结论

**存在轻度违规。** 6 个页面直接调用 API，未通过 store 层。主要影响 admin 和 analysis 页面。建议为 admin 面板创建专用 store 或使用 React Query/SWR 管理服务端状态。**change**（需要添加 store 层抽象 —— 6 个页面的重构）。

---

## 切片 03 综合评分

| 维度              | 评分      | 说明                                                                         |
| ----------------- | --------- | ---------------------------------------------------------------------------- |
| Q1 依赖方向       | ⚠️ 3/5    | Domain 层 2 处违规 + depcruise 配置失效                                      |
| Q2 循环依赖       | ✅ 5/5    | 手动分析未发现循环依赖                                                       |
| Q3 workspace 协议 | ✅ 5/5    | 所有跨包引用使用 `workspace:*`                                               |
| Q4 跨服务契约     | ❌ 1/5    | Go 引擎无正式契约定义                                                        |
| Q5 前端分层       | ⚠️ 3/5    | 6 个页面直接调用 API                                                         |
| **综合**          | **3.4/5** | 需要修复：depcruise 配置、domain handler 注入、Go 引擎契约、admin store 重构 |

## 关键行动项

| 优先级 | 行动                                                                               | 影响范围                                                                        | 预估工时 |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| P0     | Go 引擎 HTTP 接口加入 OpenAPI 规范或引入跨服务契约                                 | `docs/openapi.yaml`, `engine-go/`, `packages/backend/src/utils/engineClient.ts` | 2-3d     |
| P1     | 更新 `.dependency-cruiser.config.mjs` 路径匹配 `packages/` 结构                    | `.dependency-cruiser.config.mjs`                                                | 0.5d     |
| P1     | 修复 domain event handlers 使用 `DomainLogger` 接口注入替代直接引用 `utils/logger` | `RebalanceTriggeredHandler.ts`, `BacktestCompletedHandler.ts`                   | 0.5d     |
| P2     | 为 admin 页面创建专用 Zustand store                                                | `pages/admin/*.tsx`, `store/`                                                   | 1d       |
| P2     | 修复 AnalysisPage 使用 `apiFetch` 而非 store                                       | `AnalysisPage.tsx`                                                              | 0.5d     |
| P3     | 路由层移除直接 `db/` 调用，改为通过服务层                                          | `backtestRoutes.ts`, `dataRoutes.ts`                                            | 0.5d     |
