# 切片05：演进性

> 调研时间: 2026-07-06
> 范围: 新增策略变更面、数据源替换影响、实时架构支持、多租户扩展、前端独立部署

---

## Q1: 新增一个策略类型需改几个文件？

### 证据

以现有策略路由注册模式为基准进行分析：

- 读取 `packages/backend/src/routes/backtestRoutes.ts`：该文件复合了回测、MC、优化、有效前沿等 5 种计算类型，503 行
- 注册模式为 `router.post('/strategy-name', middlewareChain, handler)`
- handler 从 `packages/backend/src/services/` 调用对应的 service 方法
- service 方法调用 `engineClient.ts` 转发到 Go engine（HTTP）
- 前端需要对应的页面组件 + 路由 + store action
- Go engine 需要新增端点的 handler + 计算逻辑

**变更文件清单（估算）**：

| 层级      | 文件                                                            | 改动类型  |
| --------- | --------------------------------------------------------------- | --------- |
| Go engine | `engine-go/internal/engine/` 新增策略模块                       | 新增      |
| Go engine | `engine-go/internal/server/` 新增路由 handler                   | 新增      |
| Node API  | `packages/backend/src/routes/backtestRoutes.ts` 新增路由        | 修改      |
| Node API  | `packages/backend/src/services/engineService.ts` 或新增 service | 新增/修改 |
| Node API  | `packages/backend/src/schemas/` 新增 zod schema                 | 新增      |
| Frontend  | 新增页面组件                                                    | 新增      |
| Frontend  | `App.tsx` 新增 lazy route                                       | 修改      |
| Frontend  | store 新增 action                                               | 修改      |
| Shared    | types 新增接口                                                  | 修改      |

**总计：约 8-9 个文件需要改动。**

### 分析

对比目标 <5 个文件，实际需要约 9 个文件，差距明显。根本原因：

1. Go engine + Node API 的双轨制：策略逻辑在 Go engine，但路由编排在 Node，变更需跨语言改两端
2. 前端页面 + store + route 是三层 glue code，无法跳过
3. backtestRoutes.ts 的复合设计导致新增策略时在该文件内增加代码，加剧文件膨胀

### 结论

**change** — 需要系统性地降低新增策略的变更面。建议方向：

- 将 backtestRoutes.ts 按策略类型拆分为独立路由文件（如 `monteCarloRoutes.ts`、`optimizerRoutes.ts`）
- 建立策略注册机制，允许按目录自动注册（类似 Go 的 handler 注册模式）
- 考虑将前端页面生成自动化

---

## Q2: 替换/新增数据源的影响面？

### 证据

- `data-fetcher/internal/` 下有 6 个 provider 目录：akshare、finnhub、twelvedata、yfinance、provider、httpclient
- `data-fetcher/internal/provider/provider.go` 定义了 Provider 接口
- 读取 provider.go 确认接口方法：FetchPriceData()、SearchTickers()、ValidateTicker() 等
- `packages/backend/src/services/dataService.ts` 通过 HTTP 调用 data-fetcher，再回退到 PostgreSQL

**新增一个数据源需要：**

| 文件                                                       | 改动类型 |
| ---------------------------------------------------------- | -------- |
| `data-fetcher/internal/<new-provider>/` 实现 Provider 接口 | 新增     |
| `data-fetcher/internal/provider/registry.go` 或类似注册处  | 修改     |
| Go 测试文件                                                | 新增     |

**总计：约 3-5 个 Go 文件。**

### 分析

Provider 接口抽象良好，新增数据源的影响面控制在 data-fetcher 内部。Node API 层无需改动（仅需配置支持）。替换主数据源（如从 PostgreSQL 转移到 data-fetcher 作为主）则需要改 dataService.ts 的降级逻辑，但不常见。

### 结论

**keep** — Provider 接口抽象合理，新增数据源影响面小（约 3-5 Go 文件）。

---

## Q3: 当前短连接架构支撑实时回测/WebSocket 推送的成本？

### 证据

- `grep -r "ws\|WebSocket\|socket.io\|SSE\|Server-Sent\|EventSource" packages/` → 无 WebSocket 或 SSE 使用
- `grep "ws\|socket.io" package.json` → 无相关依赖
- Express 是标准的 request-response 模型，无长连接支持
- `packages/backend/src/server.ts` 使用 `app.listen()` 标准 HTTP 启动

### 分析

从短连接改造到长连接需要：

1. 引入 ws/socket.io 或 SSE 库
2. 改造 server.ts 支持 ws upgrade
3. 将回测等长时间计算改为异步 Job → push 模式（当前是同步 request → response）
4. 前端 store 增加 ws 订阅逻辑
5. Redis Pub/Sub 或 BullMQ 做跨进程推送（如果 Go engine 需要直接推）

**改造工作量估计：15-20 人天**（引入 ws 库 + 异步化 + 推送链路）

### 结论

**investigate further** — 短期内不建议做。如果业务需求确认需要实时推送，建议先做可行性 POC（特别关注 Go engine 如何参与推送）。

---

## Q4: 多租户 RLS 模型扩展成本？新增租户类型需改什么？

### 证据

- ADR-032（docs/adr/ADR-032-多租户RLS隔离模型.md）定义 5 张租户表使用 FORCE RLS
- `grep -r "RLS\|FORCE RLS\|NOBYPASSRLS" migrations/` 确认 RLS policy 定义
- `packages/backend/src/middleware/rbac.ts` 解析角色逻辑
- `packages/backend/src/middleware/jwtAuth.ts` 解析 JWT claims 中的 org/role

新增租户类型的改动画：

1. migrations 新增 RLS policy（1 文件）
2. rbac.ts 增加角色映射（1 文件修改）
3. 可能新增 route 级别的权限检查（取决于租户类型）

### 分析

RLS 模型设计良好，扩展成本低。新增租户类型主要影响 RLS policy 和角色映射，影响面 2-3 文件。

### 结论

**keep** — 多租户设计扩展性强，新增租户类型成本低。

---

## Q5: 前端独立部署程度？

### 证据

- `vite.config.ts`：有 proxy 配置 `'/api': { target: 'http://localhost:5001', changeOrigin: true }`
- `grep -r "VITE_API\|API_URL\|apiBase\|baseURL" packages/frontend/src/` 检查环境变量使用
- `packages/frontend/src/utils/apiFetch.ts` 或类似 API 客户端文件

### 分析

前端在开发环境下通过 Vite proxy 代理到后端（localhost:5001）。生产构建后是纯静态文件，需通过 nginx 或类似方式配置 API 反向代理。如果生产环境 API 地址和前端部署地址不同，需要：

- 通过 `VITE_API_BASE_URL` env 注入 API 地址
- 或 nginx 层配置 api 路由转发

当前代码中 API base URL 是硬编码还是可配置需要检查实际代码。

### 结论

**keep** — 前端静态构建可独立部署，API 地址通过 proxy/env 配置解耦。
