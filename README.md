# 回测平台 (Backtest Platform)

模仿 [testfol.io](https://testfol.io/) 的专业投资组合回测平台，支持 ETF/股票/基金的历史回测、蒙特卡洛模拟、组合优化和有效前沿分析。多租户 SaaS 架构（ADR-009/ADR-010），Go+TS 双语言，并支持本地私有化部署。

## 架构概览

```
┌─────────┐    HTTP    ┌──────────┐    HTTP    ┌────────────┐
│  前端   │ ─────────▶ │ Express  │ ─────────▶ │ Go 引擎    │ (主，唯一)
│ React   │            │  API     │            │ gin+gonum  │
│ Vite    │            │ TS ESM   │            └────────────┘
└─────────┘            │          │  引擎不可用：fail-closed
                       │          │  → 503 + Retry-After（同步）
                       │          │  → 入队重试（异步）   (ADR-008)
                       │          │    HTTP    ┌────────────┐
                       │          │ ─────────▶ │ Go 数据    │ (缺失标的实时拉取)
                       └──────────┘            └────────────┘
```

| 服务        | 语言       | 目录                     | 端口  | 职责                                 |
| ----------- | ---------- | ------------------------ | ----- | ------------------------------------ |
| 前端 Web    | React/TS   | `packages/frontend/src/` | 15173 | UI 渲染、用户交互                    |
| 后端 API    | Express/TS | `packages/backend/src/`  | 15001 | 路由编排、鉴权、降级调度             |
| Go 计算引擎 | Go         | `engine-go/`             | 15004 | 主计算引擎（回测/MC/优化/前沿/分析） |
| Go 数据服务 | Go         | `data-fetcher/`          | 15003 | 主数据服务                           |

降级策略（ADR-008 fail-closed）与多租户 SaaS（ADR-009/ADR-010）详见 `docs/adr/`。

## 快速启动

**前置要求**：Node.js 20+、pnpm、Go 1.26+、PostgreSQL 16+、Redis 6+

```powershell
pnpm install          # 安装依赖
pnpm dev:all          # 全栈开发：PG/Redis + Go 引擎/数据服务 + API 15001（托管前端构建产物）
```

最小开发（仅前端+API，Go 引擎不可用时计算端点 503）：`pnpm dev`

手动启动 Go 服务（`pnpm dev:all` 已自动启动，无需手动）：
`cd engine-go && go run ./cmd/server`（默认 :5004，docker 宿主映射 :15004）
`cd data-fetcher && go run main.go`（默认 :5003，docker 宿主映射 :15003）

## 目录结构

```
packages/frontend/src/  # 前端 (React + Vite + Tailwind)
packages/backend/src/   # 后端 API (Express + TS)
engine-go/             # Go 计算引擎（gin + gonum）
data-fetcher/          # Go 数据服务 (gin)
migrations/            # PostgreSQL 迁移脚本
packages/shared/       # 前后端共享类型
tests/                 # 测试 (unit/e2e/contract/chaos/property)
docs/                  # 架构 / ADR / 运维手册
```

详细结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与 [docs/adr/README.md](docs/adr/README.md)。

## 常用命令

```powershell
pnpm dev          # 启动前端+后端开发服务器
pnpm check        # TypeScript 类型检查
pnpm lint         # ESLint
pnpm test         # 运行所有测试
pnpm test:unit    # 仅单元测试
```

## 环境变量

| 变量                  | 默认值                   | 说明                                          |
| --------------------- | ------------------------ | --------------------------------------------- |
| `GO_ENGINE_URL`       | `http://127.0.0.1:15004` | Go 计算引擎地址（唯一引擎）                   |
| `GO_DATA_SERVICE_URL` | `http://127.0.0.1:15003` | Go 数据服务地址                               |
| `DATABASE_URL`        | -                        | PostgreSQL 连接串                             |
| `REDIS_URL`           | -                        | Redis 连接串（会话/限流/队列）                |
| `NODE_ENV`            | -                        | 环境（development 显示错误详情）              |
| `APP_BASE_URL`        | `http://localhost:15173` | 验证/邀请/计费跳转链接基址（ADR-009/ADR-010） |
| `EMAIL_TRANSPORT`     | `console`                | 邮件传输：`console`/`smtp`（ADR-009）         |
| `STRIPE_SECRET_KEY`   | -                        | Stripe 密钥（留空则计费端点返回 503）         |

## 文档

- [架构详解](docs/ARCHITECTURE.md) ｜ [应用层契约](docs/application-layer-contract.md) ｜ [ADR 索引](docs/adr/README.md) ｜ [运维手册](docs/wiki/ops-guide.md)
- 开发规范与代码风格见 `AGENTS.md`（编码智能体优先阅读）
