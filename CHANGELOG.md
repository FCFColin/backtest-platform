# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_暂无未发布变更。最新发布见 [0.4.0]。_

## [0.4.0] - 2026-07-28

### Added（重大架构变更 - 引擎与数据服务）

- **Go 单引擎 fail-closed（ADR-031 落地）**：Rust `engine-rs/` 与 Node 引擎退役，Go `engine-go/`（gin + gonum）成为唯一回测/蒙特卡洛/优化器引擎。引擎不可用时 fail-closed 返回 503 + `Retry-After`，不再静默降级到 Node 计算
- **数据服务迁移到 Go data-fetcher**：Python data CLI 退役（原 `api/python/` 随 ADR-042 删除），`data-fetcher`（gin）成为主数据服务；PostgreSQL 缺失 ticker 时由 Go data-fetcher 实时拉取作为降级通路。JSON 文件仅作导入，不再作为运行时降级
- **API 包整合（ADR-042）**：`api/python/` 目录删除，admin bulk-ingest 端点返回 501；TS 后端整合到 `packages/backend/`
- **OTel SaaS 替换（ADR-044）**：可观测性后端切换为 go-shared + `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量切换，移除 SaaS 强依赖
- **合成标的支持回测至 1962 年**：扩展历史数据覆盖范围，支持长周期回测
- **Webhook 系统**：Outbox 事件触发外部 webhook 投递（含重试与幂等）
- **审计存储**：审计日志持久化存储，支持合规追溯
- **自定义 RBAC**：RBAC 角色权限扩展，支持自定义角色
- **RLS 扩展**：多租户 RLS 隔离扩展到更多表（ADR-032 范围扩大）
- **迁移添加**：新增多个数据库迁移（Outbox、CDC 支持、审计、配额等）

### Added（ADR 新增）

- ADR-046：API 版本生命周期策略（`Deprecation`/`Sunset`/`Link` 头，RFC 8594）
- ADR-047：后端模块化策略（逻辑边界 + 微服务化触发条件）
- ADR-050：微前端 Module Federation 架构预留
- ADR-051：CDC via Debezium for Outbox（多 Pod 水平扩展，门控默认关闭）
- ADR-052：CI 分层与依赖方向强制（原误编为 ADR-038，与灾难恢复策略冲突，重新编号）

### Changed（前端 v2 UI 重构）

- 前端 v2 UI 重构：导航栏、Hero 区、参数区、结果区全面重构，提升信息密度与交互体验
- ADR-039/040/041 状态确认：实际作为独立 Proposed 决策存在（多区域部署、数据生命周期、服务边界），此前被误标为已删除
- ADR-038 冲突修复：保留 ADR-038-DR-Strategy（灾难恢复，Proposed），CI 分层决策重新编号为 ADR-052
- ADR 索引（`docs/adr/README.md`）重写：基于实际文件遍历生成，移除虚假已删除条目

### Removed

- Rust `engine-rs/` 引擎代码删除（ADR-031）
- Python data CLI 与 `api/python/` 目录删除（ADR-042）
- Node 引擎降级通路移除（fail-closed 取代）

## [0.3.0] - 2026-06-24

### Added（架构变更 - ADR-007/008）

- **T-ARCH-1 PostgreSQL 迁移**：数据库从 SQLite 迁移至 PostgreSQL（ADR-007）
  - 数据库模块重写：SQLite → PostgreSQL，使用 pg（node-postgres）连接池，支持 Up/Down 迁移回滚
  - 数据导入重写：PostgreSQL 参数化 INSERT + ON CONFLICT 更新，新增 COPY 批量导入接口
  - 新增 `DATABASE_URL` 配置项 + validateConfig 生产环境校验
  - `docker-compose.yml` 新建：开发环境 PostgreSQL 16 服务（backtest 用户/数据库）
  - `.env.example`：新增 PostgreSQL 连接配置文档段
  - Schema v2 新增：tickers 全文搜索（tsvector + GIN 索引 + 自动更新触发器）
  - 连接池配置：max=20, idleTimeout=30s, connectionTimeout=5s, 生产环境强制 TLS
  - `healthCheck()` 函数：数据库连接健康检查
  - `rollbackSchema()` 函数：迁移回滚（按版本降序执行 down 函数）
- **ADR-007**：PostgreSQL 迁移决策记录，取代 ADR-006
- **ADR-008**：语言精简决策记录（4 语言 → Go + TypeScript/React），取代 ADR-001
- **ADR-001/006 状态更新**：标记为"已取代"

### Changed（架构变更）

- ADR-001 状态：已接受 → 已取代（见 ADR-008）
- ADR-006 状态：已接受 → 已取代（见 ADR-007）
- 5 个企业文档全面更新反映新架构方向（audit-enterprise/spec-enterprise/tasks-enterprise/checklist-enterprise/threat-model）

### Added（企业级改造 P1 核心）

- **T-P1-1 Saturation 指标补全**：可观测性模块新增三类 Google SRE 黄金信号中的饱和度指标
  - `node_eventloop_lag_seconds`：基于 `perf_hooks.monitorEventLoopDelay` 的 P99 事件循环延迟（10s 采样）
  - `circuit_breaker_state`：熔断器状态 Gauge（0=closed/1=open/2=halfOpen），支持多熔断器命名注册
  - `registerCircuitBreakerMetrics()` 注册函数，已接入 Go 数据服务熔断器
- **T-P1-2 Go 服务熔断器**：双熔断器保护外部依赖
  - Node 端：数据路由新增 opossum 熔断器（`go_data_service`），`callGoDataService` 调用替换为 `callGoDataServiceWithBreaker`，Open 状态自动降级
  - Go 端：`data-fetcher/main.go` 新增 `github.com/sony/gobreaker` 熔断器（`baostock`），保护 baostock TCP 连接；`withBaoStockClient` 重构为通过熔断器执行，Open 状态返回 503
- **T-P1-4 Trivy 容器安全扫描**：CI 新增 `docker` job
  - 构建 2 镜像（Node API / Go data-fetcher），tag=`${{ github.sha }}` 保证可追溯
  - Trivy 扫描 HIGH/CRITICAL 漏洞，`exit-code: 1` 阻断 CI，`ignore-unfixed: true` 跳过无修复版本漏洞
  - Dockerfile 基础镜像 `alpine:latest` → `alpine:3.20` 固定版本避免 latest 漂移
- **T-P1-5 路由层单元测试 + 覆盖率门槛**：32 个新测试 + 覆盖率门槛
  - `tests/unit/middleware/idempotency.test.ts`：6 个测试（非 POST 放行、无 Key 放行、超长 Key 拒绝、缓存写入、缓存命中、独立 Key）
  - `tests/unit/middleware/auth.test.ts`：12 个测试（requireApiKey 7 分支 + optionalApiKey 5 分支），使用 `vi.hoisted()` 解决 mock 变量提升
  - `tests/unit/middleware/auditLog.test.ts`：9 个测试（GET/HEAD/OPTIONS 跳过、POST/PUT/DELETE 注册 finish 回调、审计日志记录、anonymous userId、API Key 哈希化）
  - `tests/unit/routes/healthRoutes.test.ts`：5 个测试（health 端点 Go 引擎可用/不可用/非 2xx + metrics 端点 Prometheus 格式 + saturation 指标验证），使用 Express `app.listen(0)` + 真实 fetch 替代 supertest
  - `vitest.config.ts` 添加 coverage thresholds：lines 70% / functions 70% / branches 60% / statements 70%
- **T-P1-8 JWT/RBAC 接入**：从死代码升级为生产可用认证授权
  - 配置层：新增 `JWT_SECRET` / `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` 配置项；`validateConfig()` 校验生产环境 JWT_SECRET 必须修改默认值
  - 认证路由：新增 4 端点 `POST /api/auth/{login,refresh,logout}` + `GET /api/auth/me`，支持 Refresh Token 轮换，登录使用 `timingSafeEqual` 防时序攻击
  - JWT 中间件：从 `process.env` 改为集中配置；开发环境跳过认证判断改为 `JWT_SECRET === 'dev-only-jwt-secret-change-in-production'`
  - 管理端点（`/api/v1/admin/*`、`/api/v1/data/manage/*` 及旧路径兼容）从 `requireApiKey` 升级为 `jwtAuth + requirePermission(Permission.ADMIN_ACCESS/DATA_MANAGE)`；挂载 authRoutes 到 `/api/v1/auth` 和 `/api/auth`
  - `.env.example`：新增 JWT 认证配置文档段
  - `docs/threat-model.md` v1.1：新增 S-5（Refresh Token 轮换）、E-5（JWT_SECRET 保护）威胁项；更新 S-1、E-1、E-4、R-2 反映 JWT/RBAC 接入；架构安全现状评分认证 ⭐⭐→⭐⭐⭐、授权 ⭐⭐→⭐⭐⭐

### Added（企业级改造 P0）

- 可观测性断链修复：日志模块通过 pino mixin 注入 OTel trace_id/span_id 到每条日志，实现日志↔链路双向关联
- 请求上下文传播：基于 AsyncLocalStorage 将 request_id 传播到下游服务调用（callService 注入 x-request-id 头）
- ESLint 9 flat config：`eslint.config.js`（typescript-eslint + react-hooks + react-refresh），修复此前配置文件缺失导致的 lint 链路断裂
- Prettier 配置：`.prettierrc.json`，与 .editorconfig 对齐
- ADR-006：JSON→SQLite 迁移决策记录，取代 ADR-002
- Go 并发竞态测试：`TestDataStoreConcurrentAccess`，模拟 50 goroutine 并发读写 DataStore，配合 CI `-race` 检测

### Changed（企业级改造 P0）

- CI：Go 测试添加 `-race -count=1` 标志，启用竞态检测
- CI：Go job 添加 golangci-lint 步骤（golangci-lint-action），强制执行代码质量
- CI：npm audit 移除 `|| true`，高危漏洞阻断 CI（shift-left security）
- ARCHITECTURE.md：9.3 节更新为反映 PostgreSQL 已落地；新增 9.4 已知局限性章节、9.5 ADR 索引
- ADR-002：状态从"已接受（有条件）"改为"已取代（见 ADR-006）"
- threat-model.md：R-1（审计日志）和 E-2（非 root 用户）状态更新为"已缓解"
- runbook.md：Go 数据服务健康检查路径修正为 `/api/data/health`
- package.json：version 从 0.0.0 同步为 0.2.0（与 CHANGELOG 一致）

## [0.2.0] - 2026-06-23

### Added

- K8s 部署配置：namespace、3 个 Deployment、3 个 ClusterIP Service、ConfigMap、Ingress
- 缓存一致性机制：版本号校验 + `invalidateCache()` 函数，支持按 ticker 或全量失效
- Schema 迁移系统：基于版本号的迁移函数，事务执行，记录到 `schema_migrations` 表
- 性能基准测试：`tests/bench/statistics.bench.ts`，覆盖均值、标准差、夏普比率、最大回撤
- Pre-commit hook：husky + lint-staged，自动对 TS/JSON/YAML 文件执行 eslint --fix 和 prettier --write
- CHANGELOG.md：遵循 Keep a Changelog 规范
- On-call runbook SRE 标准要素：Escalation 路径、SLA/SLO、事故分级、Postmortem 模板

### Changed

- Dockerfile：builder 阶段添加 esbuild 打包步骤，runner 阶段 CMD 从 `node --import tsx` 改为 `node dist/server.js`
- Dockerfile（3 个）：基础镜像添加 digest pinning 注释，标记 CI 自动更新 TODO
- 数据库初始化：`initSchema` 从单次全量创建改为基于版本号的增量迁移系统

### Security

- 镜像 digest pinning：3 个 Dockerfile 的基础镜像添加 `@sha256` pinning 注释，防止供应链攻击
- 缓存版本号机制：防止多实例部署时返回过期数据
