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

> 服务拓扑与端口（前端/API/Go 引擎/Go 数据服务/PostgreSQL/Redis）见 `docs/ARCHITECTURE.md §4`。

降级策略（ADR-008 fail-closed）与多租户 SaaS（ADR-009/ADR-010）详见 `docs/adr/`。

## 快速启动

**前置要求**：Node.js 22+、pnpm、Go 1.26+、PostgreSQL 16+、Redis 6+

```powershell
pnpm install          # 安装依赖
pnpm dev:all          # 全栈开发：PG/Redis + Go 引擎/数据服务 + API 15001（托管前端构建产物）
```

最小开发（仅前端+API，Go 引擎不可用时计算端点 503）：`pnpm dev`

手动启动 Go 服务（`pnpm dev:all` 已自动启动，无需手动）：`cd engine-go && go run ./cmd/server`（:5004，宿主映射 :15004）

## 目录结构

目录树与详细结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（ADR 索引见 [docs/adr/README.md](docs/adr/README.md)）。

## 环境变量

配置以 `.env.example` 为权威源（复制为 `.env` 后按需修改），关键变量含 `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`/`GO_ENGINE_URL`/`GO_DATA_SERVICE_URL`/`ADMIN_API_KEY`，生产必填项见 `.env.example` 的 `[生产必填]` 标记。

## 生产部署

> 详细拓扑见 `docs/ARCHITECTURE.md §4`；本节是最短可用路径（B3）。

**1. 前置**：Docker + docker compose v2；外部可达域名与 TLS 终结（建议 Nginx/Caddy 反代 80/443 → 前端 :80 与 API :15001）。

**2. 配置**：复制 `.env.example` → `.env`，覆盖全部 `[生产必填]`：强随机 `JWT_SECRET`(≥32 字符)、`ENGINE_AUTH_TOKEN`/`DATA_SERVICE_AUTH_TOKEN`(≥32 字符且两服务一致)、生产数据库 `DATABASE_URL`(`sslmode=require`)、Sentinel 模式 `REDIS_SENTINELS`、`ADMIN_API_KEY`、`NODE_ENV=production`。

**3. 数据库迁移**（只增不减，up-only）：`pnpm --filter @backtest/backend migrate`（首次部署前执行，幂等可重跑）。

**4. 拉起与验证**：`docker compose up -d --build`（含观测栈；可选 `--profile redis-ha/edge/cdc`）→ `docker compose ps` 全 `healthy` → `curl -f http://127.0.0.1:15001/api/health` 200（引擎503按ADR-008）→ 前端反代域名 → Grafana :3000

**5. K8s/升级**：`k8s/overlays/{dev,staging,production}` 三叠加（密钥 `*-secret.yaml` gitignored）；升级=拉码→迁移→`up -d --build`，回滚=镜像回退+迁移前滚兼容（ADR-002）

## 文档

| 类别      | 文档                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 架构      | [ARCHITECTURE.md](docs/ARCHITECTURE.md)（权威拓扑源）｜[ADR 索引](docs/adr/README.md)｜[应用层契约](docs/application-layer-contract.md)                                  |
| 指南      | [后端深度指南](docs/wiki/deep-dive.md)｜[数据库与共享层](docs/wiki/database.md)｜[运维手册](docs/wiki/ops-guide.md)｜[Docker 开发环境](docs/development/docker-setup.md) |
| 安全/合规 | [安全管理](docs/compliance/security.md)｜[数据治理](docs/compliance/data-governance.md)｜[break-glass 密钥流程](docs/security/break-glass-procedure.md)                  |
| 运维/性能 | [runbooks](docs/runbooks/)｜[性能 SLO](docs/performance-slo.md)                                                                                                          |

开发规范与代码风格见 `AGENTS.md`（编码智能体优先阅读）；贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)；测试分层见 [tests/e2e/README.md](tests/e2e/README.md) 与 [tests/chaos/README.md](tests/chaos/README.md)。
