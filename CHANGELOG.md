# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- feat(frontend): 货币切换支持（DollarInput ¥/$）+ 图表工具打磨（tooltip 转义、坐标轴首尾刻度、dataZoom 主题化、品牌色）+ admin/表单可访问性完善（aria-label、年份截断）
- refactor(frontend): ticker 标签输入、图表空态/参考线、signal 结果面板、portfolio 编辑器 props 契约、tactical 参数共享类型收编
- refactor(frontend): UI 组件令牌化与 InfoTooltip 复用收敛
- fix(worker): 数据更新全部失败时抛错触发重试/DLQ（S16）
- fix(backend)：引擎成功指标移至契约校验通过后记录（校验失败不双计）；计算端点输入规模上限收紧（MC 模拟/年数、优化迭代、有效前沿点数）
- fix(frontend)：月度热力图月份标签走 i18n（移除硬编码英文缩写）
- test：回测路由引擎契约断言收紧（tickers/correlations 全等）；e2e fuzz 错误判定收窄为运行期错误文案、a11y 断言参数语义修正；组合权重校验工具单元覆盖；测试样板收敛
- chore(ci)：覆盖率检查脚本容错（前缀匹配 startsWith、无数据文件降级警告）
- 治理收尾：verify 拆分出 verify-static（C-015 ADR 一致性/C-016 CHANGELOG/C-017 迁移/C-019 前端死代码等纯静态检查），CI 的 `--skip-db --skip-frontend` 不再使其失效；run-all 仅聚合本次运行脚本的结果并清理过期 audit 生成物
- 配置/文档对齐：tsconfig paths 收敛单一通配、vite 死 glob 清理、env 默认 DB 用户降权为最小权限 backtest_app、.env.example 权威源指引、React 19 版本对齐、ops-guide/security 端口与键名修正
- 治理收尾（ADR-017）：退役 CI 从不执行的 verify-backend/verify-frontend 脚本（RLS/迁移由集成测试+静态检查承担），run-all 移除 --skip-db/--skip-frontend 分支；CLS 与起始资金默认值断言并入 E2E（page-load-performance P4、backtest beforeEach）
- 治理收尾（ADR-013~018）：退役死 schema、未实现引擎字段、data-fetcher 独立 worker CLI、零消费者认证/用户管理出口、悬空 verify 脚本；迁移 forward-only 退役回滚机制

- chore(adr): ADR-018 迁移 forward-only，退役回滚机制；文档对齐（deep-dive/application-layer-contract 移除 events/ 引用）；docker-compose data-fetcher 降权至 backtest_app

## [0.4.1] - 2026-08-09

- 全仓库行数缩减至 ~100k 基线（多轮 sweep）；compute 超时差异化（C-020）；outbox 失败不误标 + audit event_id 修复（ADR-005）；refresh token 防重放；Stripe 清理；数据契约对齐；Go engine nil-path 守卫
- CI：Trivy 容器扫描（C-025）+ govulncheck；knip + verify:critical 门禁；pnpm audit 归零（react-router v8）

## [0.4.0] - 2026-07-28

### Added（重大架构变更 - 引擎与数据服务）

- **Go 单引擎 fail-closed（ADR-008 落地）**：Rust `engine-rs/` 与 Node 引擎退役，Go `engine-go/`（gin + gonum）成为唯一回测/蒙特卡洛/优化器引擎。引擎不可用时 fail-closed 返回 503 + `Retry-After`，不再静默降级到 Node 计算
- **数据服务迁移到 Go data-fetcher**：Python data CLI 退役（原 `api/python/` 随 ADR-011 删除），`data-fetcher`（gin）成为主数据服务；PostgreSQL 缺失 ticker 时由 Go data-fetcher 实时拉取作为降级通路。JSON 文件仅作导入，不再作为运行时降级
- **API 包整合（ADR-011）**：`api/python/` 目录删除，admin bulk-ingest 端点返回 501；TS 后端整合到 `packages/backend/`
- **OTel SaaS 替换（ADR-006）**：可观测性后端切换为 go-shared + `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量切换，移除 SaaS 强依赖
- **合成标的支持回测至 1962 年**：扩展历史数据覆盖范围，支持长周期回测
- **审计存储**：审计日志持久化存储，支持合规追溯
- **RLS 扩展**：多租户 RLS 隔离扩展到更多表（ADR-009 范围扩大）
- **迁移添加**：新增多个数据库迁移（Outbox、CDC 支持、审计、配额等）

### Added（ADR 新增）

- ADR-011：后端模块化策略（逻辑边界 + 微服务化触发条件）
- ADR-005：CDC via Debezium for Outbox（多 Pod 水平扩展，门控默认关闭）

### Changed（前端 v2 UI 重构）

- 前端 v2 UI 重构：导航栏、Hero 区、参数区、结果区全面重构，提升信息密度与交互体验
- ADR 索引（`docs/adr/README.md`）重写：基于实际文件遍历生成，移除虚假已删除条目

### Removed

- Rust `engine-rs/` 引擎代码删除（ADR-008）
- Python data CLI 与 `api/python/` 目录删除（ADR-011）
- Node 引擎降级通路移除（fail-closed 取代）

## [0.3.0] - 2026-06-24

### Added（架构变更 - ADR-002/ADR-003）

- **T-ARCH-1 PostgreSQL 迁移**：数据库从 SQLite 迁移至 PostgreSQL（ADR-002）
  - 数据库模块重写：SQLite → PostgreSQL，使用 pg（node-postgres）连接池，支持 Up/Down 迁移回滚
  - 数据导入重写：PostgreSQL 参数化 INSERT + ON CONFLICT 更新，新增 COPY 批量导入接口
  - 新增 `DATABASE_URL` 配置项 + validateConfig 生产环境校验
  - `docker-compose.yml` 新建：开发环境 PostgreSQL 16 服务（backtest 用户/数据库）
  - `.env.example`：新增 PostgreSQL 连接配置文档段
  - Schema v2 新增：tickers 全文搜索（tsvector + GIN 索引 + 自动更新触发器）
  - 连接池配置：max=20, idleTimeout=30s, connectionTimeout=5s, 生产环境强制 TLS
  - `healthCheck()` 函数：数据库连接健康检查
  - `rollbackSchema()` 函数：迁移回滚（按版本降序执行 down 函数）
- **ADR-002**：PostgreSQL 迁移决策记录，取代 DADR-006
- **ADR-003**：语言精简决策记录（4 语言 → Go + TypeScript/React），取代 DADR-001
- **DADR-001/006 状态更新**：标记为"已取代"

### Changed（架构变更）

- DADR-001 状态：已接受 → 已取代（见 ADR-003）
- DADR-006 状态：已接受 → 已取代（见 ADR-002）
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
  - `vitest.config.ts` 添加 coverage thresholds：lines 70% / functions 70% / branches 60% / statements 70%（后提升至 lines/functions/statements ≥80%, branches ≥80%，见 `scripts/check-coverage.mjs`）
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
- DADR-006：JSON→SQLite 迁移决策记录，取代 DADR-002
- Go 并发竞态测试：`TestDataStoreConcurrentAccess`，模拟 50 goroutine 并发读写 DataStore，配合 CI `-race` 检测

### Changed（企业级改造 P0）

- CI：Go 测试添加 `-race -count=1` 标志，启用竞态检测
- CI：Go job 添加 golangci-lint 步骤（golangci-lint-action），强制执行代码质量
- CI：npm audit 移除 `|| true`，高危漏洞阻断 CI（shift-left security）
- ARCHITECTURE.md：9.3 节更新为反映 PostgreSQL 已落地；新增 9.4 已知局限性章节、9.5 ADR 索引
- DADR-002：状态从"已接受（有条件）"改为"已取代（见 DADR-006）"
- threat-model.md：R-1（审计日志）和 E-2（非 root 用户）状态更新为"已缓解"
- runbook.md：Go 数据服务健康检查路径修正为 `/api/data/health`
- package.json：version 从 0.0.0 同步为 0.2.0（与 CHANGELOG 一致）
