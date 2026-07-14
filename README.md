# 回测平台 (Backtest Platform)

模仿 [testfol.io](https://testfol.io/) 的专业投资组合回测平台，支持 ETF/股票/基金的历史回测、蒙特卡洛模拟、组合优化和有效前沿分析。本地部署、免费、Go+TS 双语言架构。

## 架构概览

本平台以 **Go 为唯一主计算引擎**（ADR-008），通过 HTTP 编排各服务：

```
┌─────────┐    HTTP    ┌──────────┐    HTTP    ┌────────────┐
│  前端   │ ─────────▶ │ Express  │ ─────────▶ │ Go 引擎    │ (主，唯一)
│ React   │            │  API     │            │ gin+gonum  │
│ Vite    │            │ TS ESM   │            └────────────┘
└─────────┘            │          │  引擎不可用：fail-closed
                       │          │  → 503 + Retry-After（同步）
                       │          │  → 入队重试（异步）   (ADR-031)
                       │          │
                       │          │    HTTP    ┌────────────┐
                       │          │ ─────────▶ │ Go 数据    │ (主，缺失标的实时拉取)
                       │          │            │ gin        │
                       │          │            └────────────┘
                       │          │    持久化      │
                       │          │ ─────────▶ ┌────────────┐
                       │          │            │ PostgreSQL │
                       └──────────┘            └────────────┘
```

| 服务        | 语言       | 目录                     | 端口 | 职责                                 |
| ----------- | ---------- | ------------------------ | ---- | ------------------------------------ |
| 前端 Web    | React/TS   | `packages/frontend/src/` | 5173 | UI 渲染、用户交互                    |
| 后端 API    | Express/TS | `packages/backend/src/`  | 5001 | 路由编排、鉴权、降级调度             |
| Go 计算引擎 | Go         | `engine-go/`             | 5004 | 主计算引擎（回测/MC/优化/前沿/分析） |
| Go 数据服务 | Go         | `data-fetcher/`          | 5003 | 主数据服务                           |

> **降级策略（ADR-031，fail-closed）**：正确性关键计算（组合回测、蒙特卡洛、优化、有效前沿、单资产分析）在 Go 引擎不可用时**不再静默降级**返回 Node 计算的、与主引擎不一致的数字；同步请求返回 `503 + Retry-After`，异步任务入队重试。
>
> **Node-canonical 功能**：`tactical`/`tacticalGrid`/`signal`/`goalOptimizer`/`pca`/`letf` 无引擎实现，Node 即权威实现（非降级），直接在 Node 计算。
>
> **数据策略**：PostgreSQL 为持久化主存储；Go 数据服务提供缺失标的实时拉取，结果回写 PostgreSQL。本地 JSON 文件仅用于批量导入（`pnpm import:market-data`），非运行时降级。
>
> **单引擎说明**：Rust 引擎（`engine-rs/`）与 Python 数据 CLI（`api/python/`）已退役删除（完成 Go↔Rust parity 验证后，见 ADR-008）。回测/分析/优化/蒙特卡洛由 Go 引擎独立承担，引擎不可用时 fail-closed 返回 503（ADR-031）。

## 快速启动

### 前置要求

- Node.js 18+、pnpm
- Go 1.21+（计算引擎 + 数据服务）
- PostgreSQL 14+、Redis 6+

### 开发者须知（垂直审计 T-23/T-32）

- **Ticker 双层校验**：领域层严格（`packages/backend/src/domain/value-objects/ticker.ts`）与安全净化层宽松（`packages/backend/src/utils/tickerValidation.ts`）**有意并存**，勿合并。
- **本地跳过认证**：`.env` 设置 `DEV_SKIP_AUTH=true`（仅 `NODE_ENV=development`），注入 `readonly` 用户，**非 admin**。
- **一键命令**：`make dev` / `make up` / `make test`（见 `Makefile`）。
- **Dev Container**：`.devcontainer/devcontainer.json` 提供一致多语言工具链。

### 1. 安装依赖

```powershell
pnpm install
```

### 2. 启动开发环境（推荐）

```powershell
pnpm dev
```

该命令会：

- 自动 `docker compose up -d engine-go` 并等待 Go 引擎就绪（唯一回测引擎）
- 预构建前端并由 API 托管 `dist/`（http://localhost:5001，首屏秒开，与生产一致）
- 后台增量 `vite build --watch` + 预热常用标的到 PostgreSQL

前端热更新（首访较慢）：`pnpm dev:hmr`（Vite 5173 + API 5001）

完整依赖栈（PostgreSQL/Redis 等）：`make up` 后再 `pnpm dev`

### 3. 启动 Go 计算引擎（主引擎，推荐）

```powershell
cd engine-go
go run ./cmd/server
```

监听 http://127.0.0.1:5004。**不启动时正确性关键计算将返回 `503 + Retry-After`**（fail-closed，ADR-031），而非返回降级的近似结果。

### 4. 启动 Go 数据服务（推荐）

```powershell
cd data-fetcher
go run main.go
```

监听 http://127.0.0.1:5003。提供缺失标的实时拉取，数据持久化于 PostgreSQL。

## 目录结构

```
回测平台/
├── packages/frontend/src/  # 前端 (React + Vite + Tailwind)
│   ├── components/       # 组件 (charts/layout/backtest/common)
│   ├── pages/            # 页面
│   ├── store/            # Zustand 状态管理
│   ├── hooks/            # 自定义 Hooks
│   └── lib/              # 工具函数
├── packages/backend/src/   # 后端 API (Express + TS)
│   ├── routes/           # 路由层
│   ├── services/         # 服务层
│   ├── application/      # 应用服务层 (CQRS)
│   ├── domain/           # 领域模型 (DDD aggregates + events)
│   └── engine/           # Node-canonical 引擎（tactical/signal/pca 等）
├── engine-go/            # Go 计算引擎（唯一引擎，gin + gonum）
├── data-fetcher/         # Go 数据服务 (gin)
├── migrations/           # PostgreSQL 迁移脚本
├── packages/shared/      # 前后端共享类型
├── data/                 # 市场数据 (CPI/汇率/指数/标的)
├── tests/                # 测试 (unit/e2e/adversarial)
├── docs/                 # 文档
└── .trae/documents/      # 需求/架构文档
```

详细结构见 [project-spec.md](.trae/documents/project-spec.md)，架构详解见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 技术栈

- **前端**：React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + Recharts
- **后端**：Express 4 + TypeScript (ESM) + tsx
- **Go 计算引擎**：gin + gonum（回测/蒙特卡洛/优化/有效前沿/分析）
- **Go 数据服务**：gin + baostock 客户端
- **数据库 / 缓存**：PostgreSQL (pg) + Redis (ioredis + BullMQ)
- **校验 / 观测**：Zod v4 + pino + OpenTelemetry + prom-client
- **测试**：Vitest (TS) + go test (Go)

## 常用命令

```powershell
pnpm dev          # 启动前端+后端开发服务器
pnpm build        # 构建前端
pnpm check        # TypeScript 类型检查
pnpm lint         # ESLint
pnpm test         # 运行所有测试
pnpm test:unit    # 仅单元测试
pnpm test:e2e     # 仅 E2E 测试
```

## 环境变量

| 变量                                           | 默认值                  | 说明                                                    |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `PORT`                                         | 5001                    | 后端 API 端口                                           |
| `GO_ENGINE_URL`                                | `http://127.0.0.1:5004` | Go 计算引擎地址（唯一引擎）                             |
| `ENGINE_TIMEOUT_MS`                            | `5000`                  | 引擎调用超时（毫秒，兼容旧名 `RUST_ENGINE_TIMEOUT_MS`） |
| `GO_DATA_SERVICE_URL`                          | `http://127.0.0.1:5003` | Go 数据服务地址                                         |
| `DATABASE_URL`                                 | -                       | PostgreSQL 连接串                                       |
| `REDIS_URL`                                    | -                       | Redis 连接串（会话/限流/队列）                          |
| `NODE_ENV`                                     | -                       | 环境（development 显示错误详情）                        |
| `APP_BASE_URL`                                 | `http://localhost:5173` | 验证/邀请/计费跳转链接基址（ADR-035/036）               |
| `EMAIL_TRANSPORT`                              | `console`               | 邮件传输：`console`（开发打日志）/`smtp`（ADR-035）     |
| `EMAIL_SMTP_*`                                 | -                       | SMTP 主机/端口/账号（`EMAIL_TRANSPORT=smtp` 时必填）    |
| `STRIPE_SECRET_KEY`                            | -                       | Stripe 密钥（留空则计费端点返回 503，ADR-036）          |
| `STRIPE_WEBHOOK_SECRET`                        | -                       | Stripe webhook 签名密钥                                 |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` | -                       | 各付费计划的 Stripe Price ID                            |

## 多租户 SaaS（ADR-032 ~ ADR-037）

- **租户隔离**：共享 schema + `tenant_id` + Postgres RLS（ADR-032），经 `withTenant()` 设置事务级租户上下文。
- **按组织 API 密钥**：哈希存储、可吊销、按组织管理，`/api/v1/keys`（ADR-033）；`ADMIN_API_KEY` 降级为平台 break-glass 密钥。
- **服务端持久化 + 前端认证**：组合/命名配置/回测历史落库并按租户隔离；前端 Bearer 会话 + 自动刷新 + 组织切换（ADR-034）。
- **自助注册 + 邀请**：邮箱注册（建组织 + owner）、邮箱验证、组织成员/邀请管理（ADR-035，nodemailer）。
- **Stripe 计费**：Checkout / Billing Portal / webhook（原始体签名校验），订阅状态权威回写组织计划（ADR-036）。
- **配额与公平调度**：按计划月度次数/标的数/并发/速率上限，用量计量（`usage_events`/`usage_counters` + Redis），租户公平的 worker 在途上限（ADR-037）。

## 文档

- [项目结构规范](.trae/documents/project-spec.md) - 结构与命名宪法
- [架构详解](docs/ARCHITECTURE.md) - 服务拓扑、降级链、数据流
- [产品需求文档](.trae/documents/prd.md) - 功能模块与页面设计
- [技术架构](.trae/documents/tech-architecture.md) - API 定义与数据模型
