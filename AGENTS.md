# Agent Guide — 回测平台 (Backtest Platform)

## 决策原则（MUST — 最高优先级，凌驾于本文件其余一切）

- **必须坚持大型企业级大型SaaS级实践**，且以**"行数便宜、不牺牲功能与可读性（尤其对编码智能体的可读性）"的方式**落地——两者不是取舍，目标形态必须是"企业级实践 ∧ 行数便宜 ∧ 功能/可读性不减"的收敛解。企业级实践 = 可复现构建（lockfile 提交）、供应链安全、可审计、最小惊讶；与本地权宜冲突时按行业标准做。
- **行数缩减服从决策原则**：缩减只在收敛到上述形态时成立；不得以减行为名触碰安全面、测试覆盖、可观测面、已暴露配置面与可审计性。

## Refactoring Philosophy（重构哲学）

- **重构的目标是降低下一个读者的认知负担**，不是展示技巧，也不是削减行数。
- **变短但更难懂的改动 = 严格更差**：为减行牺牲可读性或功能是倒退，不做。
- **不确定就问**：改动是否安全或必要拿不准时，先问，不猜，不擅自推进。

## 缩减原则（MUST — 受决策原则约束）

- **修复执行**：减行或零成本的修复直接做，不因风险犹豫；需增行或高风险的修复按"收益 × 必要性 / 成本 × 风险"权衡，收益小、投入大或危险的一律放弃并说明理由。
- **削减方向**：每次修改同步扫描周围的削减/重构/删除机会，按重构哲学取舍——可读性优先，行数是结果而非目标：

  1. **重复与样板**：同模式跨文件/跨模块的重复（查询、校验、鉴权、日志、CRUD、组件、样式、配置、mock/setup、迁移）→ 提取共享工厂/工具/模板，或参数化、表驱动化。
  2. **死代码与废弃**：零消费者模块/导出、不再需要的兼容层、废弃文件/文档/配置/依赖/脚本/迁移旧版本、过期 TODO、未引用资源 → 删除。
  3. **结构与分层**：空转抽象、过度分层、可下沉到 domain/ORM 的规则、可合并的层/文件 → 收敛。
  4. **数据化**：可表/字典驱动的重复分支、可下沉为数据的配置、分散常量 → 数据化。
  5. **依赖**：零使用/重复/过大依赖、自造轮子 → 删或换。
  6. **测试**：合并重复 fixture/mock 样板、表驱动化用例；保留每个唯一行为场景至少一个断言。
  7. **文档**：过时、与代码重复、可归档的说明 → 删或归档。

- **目标选择启发式（不要优先大文件）**：目标排序按"家族重复密度 × 样板密度"的杠杆，而非文件大小。小文件相似家族可先合并再砍；跨文件机会权重高于单文件内砍；大文件仅当确有结构冗余且未被反复砍过，连续命中同一文件即换目标。
- **行数统计与目标**：全仓库以 `scc` 口径统计（`pnpm loc`，基线 179,541 行）；目标 ≤100,000 行，当前值以 `pnpm loc` 为准。
- **删除门禁**：删除配置面/子系统/导出/测试前确认零生产消费者且无悬挂配置面；配套测试**迁移而非删除**；涉及安全/授权/可观测/已暴露配置面的删除需 ADR 记录并独立提交。
- **注释**：删 what、留 why（ADR 引用、安全原因、权衡、TODO 链接）；能用自解释命名/结构表达的，先改代码，不留注释。
- **格式化**：不对抗 prettier/gofmt/eslint，按标准格式收尾；代码紧凑度以格式化后的标准形态为准，不以手动压缩为荣。
- **可读性**：空行精简——连续空行 ≥2 → 合并为 1；函数间/describe 间保留 1 个结构空行；变量声明与立即使用代码之间的空行可删。
- **测试**：保留每个唯一行为场景至少一个断言；覆盖率不足则增加，不减少。
- **验证**：每次修改后运行相应验证（格式化、相关测试、类型检查、契约测试），命令以 package.json scripts 为权威源。

### AGENTS.md 自维护 MUST

- AGENTS.md 只保留**必要的大方向意图**（规则/权衡/禁止项）与**大方向架构**（技术选型/服务拓扑/跨服务契约）。不保留具体实现细节、已完成工作的历史/快照、示例清单、路径/命令/常量/版本号等易过时内容；具体细节以代码、package.json scripts、docs/ 为权威源。
- 修改本文件本身就是缩减机会：优先删而非加，新增必须压缩后落地。

## Quick Start

**Prerequisites**: Node.js 20+, Go 1.26+, pnpm, PostgreSQL 14+, Redis 6+。`pnpm install` / `pnpm dev`（frontend 15173 + API 15001）/ `pnpm check`（tsc）/ `pnpm lint` / `pnpm test`（全部 vitest）。

## Tech Stack

| Layer                   | Technology                                                                  |
| ----------------------- | --------------------------------------------------------------------------- |
| Frontend                | React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + ECharts         |
| Backend API             | Express 4 + TypeScript (ESM) + tsx                                          |
| Engine (only)           | Go (engine-go, gin + gonum) — Rust/Node fallbacks retired (ADR-003/ADR-008) |
| Data service (primary)  | Go (data-fetcher, gin)                                                      |
| Data service (fallback) | Go data-fetcher (live fetch for missing tickers)                            |
| Database                | PostgreSQL (pg, node-postgres)                                              |
| Cache/Auth              | Redis (ioredis + BullMQ)                                                    |
| Validation              | Zod (zod v4)                                                                |
| Observability           | pino + OpenTelemetry + prom-client                                          |

## Architecture

- **4 services, 2 languages (TS/Go)**: Frontend → Express API → Go engine + Go data service
- **Degradation**: Engine fail-closed 503 + Retry-After（ADR-008）；Data 降级走 Go data-fetcher（仅缺 ticker），响应带 `degraded` 标记。
- Full topology: `docs/ARCHITECTURE.md`；ADRs: `docs/adr/`

## Conventions

### Code Style

- TypeScript: ESM，相对导入用 `.js` 扩展名
- ESLint flat config（`eslint.config.js`）+ Prettier（`.prettierrc.json`）
- 无注释掉的代码、无 TODO/FIXME/HACK；注释讲 _why_ 不讲 _what_；导出函数需 JSDoc

### Naming

| Artifact   | Convention  | Example                     |
| ---------- | ----------- | --------------------------- |
| Files      | camelCase   | `backtestRoutes.ts`         |
| Interfaces | PascalCase  | `PortfolioResult`           |
| Types      | PascalCase  | `RebalanceFrequency`        |
| Functions  | camelCase   | `fetchHistoryData()`        |
| Constants  | UPPER_SNAKE | `MAX_TICKERS`               |
| Routes     | kebab-case  | `/api/backtest/monte-carlo` |

### Shared Types

- Barrel 从 `packages/shared/types/index.ts` 导出；接口非显然字段需 JSDoc

### React

- **非渲染逻辑归属自定义 hooks**：state、effects、事件处理器放自定义 hooks，页面组件只做渲染编排。
- **性能优化须师出有名**：`memo()` / `useMemo()` / `useCallback()` 仅当消费组件已用 `React.memo()` 包裹且有文档化的性能理由时使用；其余一律主动移除。
- **渲染保持简单直接**：列表 map 仅限结构相同且来自外部数据的重复项，其余用显式 JSX；key 用稳定唯一标识，不用数组索引。
- **CSS 克制**：不覆盖 Tailwind 工具类、不在 `*` 上加 transition；`!important` 仅用于别无他法的第三方样式。

### Testing

- Vitest（unit/integration/contract/chaos/property）+ Playwright E2E；测试文件在顶层 `tests/` 按目录分型（见 scripts）
- 命令：`pnpm test:unit` / `test:integration` / `test:contract` / `test:chaos` / `test:property` / `test:e2e:ui` / `test:docker`
- 覆盖率：行/函数/语句/分支 ≥80%（以 `scripts/check-coverage.mjs` 为权威源）

### Git

- Conventional Commits：`<type>(<scope>): <description>`；types: `feat`/`fix`/`refactor`/`chore`/`docs`/`test`
- Branches: `feature/*` / `fix/*` / `refactor/*` → PR → `main`（protected）
- Pre-commit: husky + lint-staged（eslint --fix + prettier --write）

## Key ADR References

| ADR     | Decision                                                        |
| ------- | --------------------------------------------------------------- |
| ADR-001 | Express over Fastify/NestJS                                     |
| ADR-002 | PostgreSQL over SQLite for horizontal scaling                   |
| ADR-003 | Go + TypeScript over 4-language architecture                    |
| ADR-004 | DDD aggregates + outbox 事件总线（非事件溯源）                  |
| ADR-005 | Outbox (LISTEN/NOTIFY + CDC) + consumer idempotency             |
| ADR-006 | OTel + pino + prom-client, SaaS backend (go-shared)             |
| ADR-007 | JWT + RBAC + task ownership + per-org API keys                  |
| ADR-008 | Single Go engine fail-closed (no Node/Rust fallback)            |
| ADR-009 | Multi-tenant SaaS (RLS + persistence + BFF auth + registration) |
| ADR-010 | Stripe billing + per-plan quota + fair scheduling               |
| ADR-011 | Backend code organization (package merge + modularization)      |
| ADR-012 | Retire zero-consumer subsystems and dead config toggles         |
| ADR-013 | Retire dead schemas                                             |

## API Patterns

- Response: `{ success, data?, error? }`（RFC 7807 ProblemDetails）。Data 端点降级时含 `degraded` 标记；Engine 端点 fail-closed 503 + Retry-After、无 degraded（ADR-008）。
- Auth: JWT Bearer，或 `x-api-key`（按组织哈希密钥、可吊销）。仅 `ADMIN_API_KEY` 是不可吊销的 break-glass 凭证，须严格保管并尽量少用。
- 路由挂 `/api/v1/`；compute 端点（`/api/backtest/*`）限流 10 req/min；错误 type URI: `https://backtest.platform/errors/{code}`
