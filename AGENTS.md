# Agent Guide — 回测平台 (Backtest Platform)

## 决策原则（MUST — 最高优先级，凌驾于本文件其余一切）

- **必须坚持大型企业级大型SaaS级实践**，且以**"行数便宜、不牺牲功能与可读性（尤其对编码智能体的可读性）"的方式**落地——两者不是取舍，目标形态必须是"企业级实践 ∧ 行数便宜 ∧ 功能/可读性不减"的收敛解。企业级实践 = 可复现构建（lockfile 提交）、供应链安全、可审计、最小惊讶；与本地权宜冲突时按行业标准做。
- **行数缩减服从决策原则**：缩减只在收敛到上述形态时成立；不得以减行为名触碰安全面、测试覆盖、可观测面、已暴露配置面与可审计性。

## 缩减原则（MUST — 受决策原则约束）

### 修复/审计执行准则（性价比约束，最高优先级）

- **减行或零成本的修复一律执行，不因风险犹豫**（顺手 bug、死代码、重复收敛）。
- **需增行或高风险的修复**：按"收益 × 必要性 / 成本 × 风险"权衡后决定做或不做；收益小、投入大或改动危险的一律果断放弃，并在回复中列明原因。
- **删除门禁（配置面/子系统/导出/测试）**：删除前确认零生产消费者且无悬挂配置面；配套测试**迁移而非删除**（被删功能自身的测试除外）；涉及安全/授权/可观测/已暴露配置面的删除需 ADR 记录并独立提交，不得夹带在顺手清理中。

### 行数 MANDATE

- **修改代码时必须尽可能减少行数，而不是增加行数**。如果不得不增加，必须尽可能少增加，并且增加后立即自我激进精简一波。必须遵循性价比和收益风险比的原则。
- **始终寻找不重复正文的可操作、高性价比削减/重构/删除机会**。每次修改代码时同步扫描周围死代码、冗余和简化机会，按抽象方向现场判断：

  1. **重复与样板**：同模式跨文件/跨模块的重复（查询、校验、鉴权、日志、CRUD、组件、样式、配置、mock/setup、迁移）→ 提取共享工厂/工具/模板，或参数化、表驱动化。
  2. **死代码与废弃**：零消费者模块/导出、不再需要的兼容层、废弃文件/文档/配置/依赖/脚本/迁移旧版本、过期 TODO、未引用资源 → 删除。
  3. **结构与分层**：空转抽象、过度分层、可下沉到 domain/ORM 的规则、可合并的层/文件 → 收敛。
  4. **数据化**：可表/字典驱动的重复分支、可下沉为数据的配置、分散常量 → 数据化。
  5. **依赖**：零使用/重复/过大依赖、自造轮子 → 删或换。
  6. **测试**：合并重复 fixture/mock 样板、表驱动化用例；保留每个唯一行为场景至少一个断言。
  7. **文档**：过时、与代码重复、可归档的说明 → 删或归档。

- **目标选择启发式（不要优先大文件）**：目标排序按"家族重复密度 × 样板密度"的杠杆，而非文件大小。小文件相似家族可先合并再砍；跨文件机会权重高于单文件内砍；大文件仅当确有结构冗余且未被反复砍过，连续命中同一文件即换目标。
- 目标：全仓库 ~100,000 行（基线 179,541 @ scc 口径，当前值以 `pnpm loc` 为准）。

### 注释 MUST

- **删"what"注释**：注释只说代码在做什么 → 必须删。代码本身已说明的注释全部删。
- **保留"why"注释**：ADR 引用、安全原因、权衡解释、TODO 链接 → 保留。
- **注释精简前尝试先用代码自注释**：通过重命名变量/函数/类型为自解释名称，让代码自己说话，消除注释需求。
- **缩进保留的"why"注释本身也要精简**：能用一句话说清的不用两段。

### 格式化 MUST

- **不得对抗格式化工具**（prettier / gofmt / eslint）。修改 TS 后必须 `prettier --write`，修改 Go 后必须 `gofmt -w`。
- 不得以格式化忽略指令、超长行、YAML/JSON 流式折叠牺牲可读性，不得以 go:generate 或 build tag 绕过 gofmt。
- 紧凑单行代码如果被 prettier/gofmt 展开，说明它本身就是错的（不可读）。必须接受格式化后的标准格式，然后做真结构削减。

### 可读性 MUST

- **保证功能 + 可读性 + 易用性**。不删功能、不改 API、不改行为。
- 空行精简：连续空行 ≥2 → 合并为 1。函数间/describe 间保留 1 个结构空行。变量声明与立即使用的代码之间的空行可删。
- 代码紧凑度以 prettier/gofmt 标准格式为基准，不以手动压缩行数为准。

### 测试 MUST

- **保留测试覆盖率**：不删唯一行为场景的断言。重要覆盖、常见情况、边界情况、对抗性测试必须保留。
- 如果测试覆盖率不足，还需要**增加**测试（而不是减少）。
- 测试可以精简：表驱动（it.each）、共享 helper 提取、重复 mock 样板合并。但必须保持每个唯一行为场景至少一个断言。

### 验证 MUST

- 每次修改后运行：`pnpm exec prettier --write <文件>`（TS/JS）或 `gofmt -w <文件>`（Go）
- 相关测试：`pnpm exec vitest run <修改文件的测试>`（TS）或 `go test ./...`（Go）
- 类型检查：`pnpm check`（turbo 逐包 tsc；根 tsconfig 为空 solution 文件，裸 `tsc --noEmit` 无效）
- 契约测试：`pnpm exec vitest run tests/contract`（如果动了路由/schema/openapi）
- 最终 `pnpm exec vitest run tests/unit` 全量通过（0 失败，不允许"预存失败"——任何失败都必须修复）

### AGENTS.md 自维护 MUST

- AGENTS.md 只保留**必要的大方向意图**（规则/权衡/禁止项）与**大方向架构**（技术选型/服务拓扑/跨服务契约）。不保留具体实现细节、已完成工作的历史/快照、示例清单、路径/命令/常量/版本号等易过时内容；具体细节以代码、package.json scripts、docs/ 为权威源。
- 修改本文件本身就是缩减机会：优先删而非加，新增必须压缩后落地。

## Quick Start

**Prerequisites**: Node.js 20+, Go 1.26+, pnpm, PostgreSQL 14+, Redis 6+。`pnpm install` / `pnpm dev`（frontend 15173 + API 15001）/ `pnpm check`（tsc）/ `pnpm lint` / `pnpm test`（全部 vitest）。

## Tech Stack

| Layer                   | Technology                                                              |
| ----------------------- | ----------------------------------------------------------------------- |
| Frontend                | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + Recharts    |
| Backend API             | Express 4 + TypeScript (ESM) + tsx                                      |
| Engine (only)           | Go (engine-go, gin + gonum) — Rust/Node fallbacks retired (ADR-008/031) |
| Data service (primary)  | Go (data-fetcher, gin)                                                  |
| Data service (fallback) | Go data-fetcher (live fetch for missing tickers)                        |
| Database                | PostgreSQL (pg, node-postgres)                                          |
| Cache/Auth              | Redis (ioredis + BullMQ)                                                |
| Validation              | Zod (zod v4)                                                            |
| Observability           | pino + OpenTelemetry + prom-client                                      |

## Architecture

- **4 services, 2 languages (TS/Go)**: Frontend → Express API → Go engine + Go data service
- **Degradation**: Engine fail-closed 503 + Retry-After（ADR-031）；Data 降级走 Go data-fetcher（仅缺 ticker），响应带 `degraded` 标记。
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

### Testing

- Vitest（unit/integration/contract/chaos/property）+ Playwright E2E；测试文件在顶层 `tests/` 按目录分型（见 scripts）
- 命令：`pnpm test:unit` / `test:integration` / `test:contract` / `test:chaos` / `test:property` / `test:e2e:ui` / `test:docker`
- 覆盖率：行/函数/语句/分支 ≥80%（以 `scripts/check-coverage.mjs` 为权威源）

### Git

- Conventional Commits：`<type>(<scope>): <description>`；types: `feat`/`fix`/`refactor`/`chore`/`docs`/`test`
- Branches: `feature/*` / `fix/*` / `refactor/*` → PR → `main`（protected）
- Pre-commit: husky + lint-staged（eslint --fix + prettier --write）

## Key ADR References

| ADR     | Decision                                                         |
| ------- | ---------------------------------------------------------------- |
| ADR-004 | Express over Fastify/NestJS                                      |
| ADR-007 | PostgreSQL over SQLite for horizontal scaling                    |
| ADR-008 | Go + TypeScript over 4-language architecture                     |
| ADR-013 | DDD aggregates + event sourcing in domain layer                  |
| ADR-014 | Outbox (LISTEN/NOTIFY + CDC) + consumer idempotency              |
| ADR-015 | OTel + pino + prom-client, SaaS backend (go-shared)              |
| ADR-016 | Circuit breakers + rate-limit fail-closed tiering                |
| ADR-017 | JWT + RBAC + task ownership + per-org API keys                   |
| ADR-018 | Redis + Sentinel HA (no memory degradation)                      |
| ADR-031 | Single Go engine fail-closed (no Node/Rust fallback)             |
| ADR-032 | Multi-tenant SaaS (RLS + persistence + BFF auth + registration)  |
| ADR-036 | Stripe billing + per-plan quota + fair scheduling                |
| ADR-047 | Backend code organization (package merge + modularization)       |
| ADR-052 | CI tiering + dependency enforcement + SBOM（CycloneDX，nightly） |
| ADR-053 | Node layer libraries (Pino + Zod + BullMQ)                       |

## API Patterns

- Response: `{ success, data?, error? }`（RFC 7807 ProblemDetails）。Data 端点降级时含 `degraded` 标记；Engine 端点 fail-closed 503 + Retry-After、无 degraded（ADR-031）。
- Auth: JWT Bearer，或 `x-api-key`（按组织哈希密钥、可吊销）。仅 `ADMIN_API_KEY` 是不可吊销的 break-glass 凭证，须严格保管并尽量少用。
- 路由挂 `/api/v1/`；compute 端点（`/api/backtest/*`）限流 10 req/min；错误 type URI: `https://backtest.platform/errors/{code}`
