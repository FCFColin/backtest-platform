# Agent Guide — 回测平台 (Backtest Platform)

## 缩减原则（MUST — 所有智能体必须遵守，放在最前面强调）

### 行数 MANDATE

- **修改代码时必须尽可能减少行数，而不是增加行数**。如果不得不增加，必须尽可能少增加，并且增加后立即自我激进精简一波。必须遵循性价比和收益风险比的原则。
- **始终寻找和正文必须严格不重复的可操作的，性价比和收益风险比高的削减机会、激进重构优化简化机会和删除机会**。每次修改代码时同步扫描周围的死代码、冗余和简化机会。包括但不限于：

  1. **削减机会**：冗余/重复代码、死代码/未使用导出、过度膨胀文件（>500行需拆分或压缩到<500）、重复的 import/export 样板、重复的 mock/setup 配置、重复的 CSS/class 定义、重复的 YAML/JSON 块（可锚点化）、重复的 SQL 模式、全文件拷贝的组件变体、重复的枚举/常量定义、重复的类型定义、重复的注释块、重复的错误处理模式、重复的日志记录模式、重复的鉴权检查、重复的参数校验、重复的响应序列化、重复的数据库查询模式、重复的 HTTP 客户端配置、重复的中间件链构造。

  2. **激进重构优化简化机会**：可合并的策略分支（参数化而非 copy-paste）、可表驱动化的重复用例（it.each / describe.each）、可提取的共享逻辑（helper/utility/工厂）、可合并的相似路由处理器、可合并的相似仓储/服务、可重建基线的迁移文件（SQL 合并）、可内联的仅单次使用小模块、可转换为函数式/声明式的命令式循环、可替换为对象查找表/MAP 的 switch/case、可统一为泛型工厂的组件包装器、可参数化的条件分支链、可提取为数据驱动的配置项、可合并为单一真实源的分散常量、可泛化复用的类型体操、可替代为 Zod schema 生成的运行时校验、可合并为统一入口的分散路由注册、可提取为共享中间件的分散鉴权/限流/日志。

  3. **删除机会**：零消费者模块/文件、不再需要的向后兼容层、废弃/遗弃文件、可清理的文档/配置、未使用的 npm/go 依赖、空目录、死测试夹具/数据文件、本应 .gitignored 却已入库的生成文件、过期 TODO/FIXME/HACK 注释、重复的类型定义（跨包重复）、仅 re-export 的 shim 文件、未引用的样式/CSS 类、未使用的 i18n key、已删除页面对应的残留路由/API、已合并的迁移文件旧版本、不再使用的脚本/工具、重复的 CI 步骤、过时的 README/文档段落、已废弃的 ADR。

  4. **结构/分层机会**：可下沉到 domain/ORM 的规则、过度分层/空转抽象（薄封装、无意义 Protocol）、可合并的层/文件。

  5. **依赖机会**：零使用/重复/过大的第三方依赖、可替换的库、重复实现的公共能力（自造轮子）。

  6. **配置数据化机会**：重复 if/elif 分支可改为表/字典驱动、可下沉为数据的配置、重复常量。

  7. **测试机会**：重复 fixture/conftest、冗余断言、慢测试（>5s）、可合并的测试模块。

  8. **前端机会**：重复组件/hooks/样式、可合并的页面、重复的 i18n key、可提取的共享布局。

  9. **一致性/样板机会**：跨模块重复的 CRUD/校验样板、可统一为模板或基类。

  10. **文档/示例机会**：过时文档、与代码重复的说明、可归档的历史说明。

- 目标：全仓库 ~115,000 行（基线 179,541，当前 117,033 @ scc 口径）。

### 注释 MUST

- **删"what"注释**：注释只说代码在做什么（如 `// 设置状态` 在 `setState(x)` 前）→ 必须删。代码本身已说明的注释全部删。
- **保留"why"注释**：ADR 引用、安全原因、权衡解释、TODO 链接 → 保留。
- **注释精简前尝试先用代码自注释**：通过重命名变量/函数/类型为自解释名称，让代码自己说话，消除注释需求。
- **缩进保留的"why"注释本身也要精简**：能用一句话说清的不用两段。

### 格式化 MUST

- **不得对抗格式化工具**（prettier / gofmt / eslint）。所有代码必须通过 `prettier --write`、`gofmt -w`、`eslint` 检查。修改 TS 后必须 `prettier --write`，修改 Go 后必须 `gofmt -w`。
- 不允许 `// prettier-ignore`、`# fmt: off`、超长行、YAML/JSON 流式折叠牺牲可读性。Go 代码不允许 `//go:generate` 或 `build tag` 绕过 gofmt。
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
- 类型检查：`pnpm exec tsc --noEmit`（TS）
- 契约测试：`pnpm exec vitest run tests/contract`（如果动了路由/schema/openapi）
- 最终 `pnpm exec vitest run tests/unit` 全量通过（0 失败；不允许"预存失败"——任何失败都必须修复，通常根因是模块合并后测试 mock 路径漂移）

## Quick Start

**Prerequisites**: Node.js 20+, Go 1.26+, pnpm, PostgreSQL 14+, Redis 6+

`powershell
pnpm install # Install dependencies
pnpm dev # Start frontend (15173) + backend API (15001)
pnpm check # TypeScript type check (tsc --noEmit)
pnpm lint # ESLint
pnpm test # Vitest (all tests)
pnpm test:unit # Unit tests only

````

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
- **Degradation**: Engine: Go → fail-closed 503 (ADR-031); Data: PostgreSQL → Go data-fetcher (missing tickers only). JSON files are import-only, not runtime fallback.
- Full topology: `docs/ARCHITECTURE.md`
- All ADRs: `docs/adr/` (19 active records; see `docs/adr/README.md` for full index including deleted/merged)

## Conventions

### Code Style

- TypeScript: **ESM** (`import`/`export`, no `require`), use `.js` extensions in relative imports
- ESLint flat config (`eslint.config.js`), Prettier (`.prettierrc.json`)
- No commented-out code. No TODO/FIXME/HACK. Comment the _why_, not the _what_.
- Exported functions need JSDoc (`@param`, `@returns`, `@throws`)

### Naming

| Artifact   | Convention  | Example                     |
| ---------- | ----------- | --------------------------- |
| Files      | camelCase   | `backtestRoutes.ts`         |
| Interfaces | PascalCase  | `PortfolioResult`           |
| Types      | PascalCase  | `RebalanceFrequency`        |
| Functions  | camelCase   | `fetchHistoryData()`        |
| Constants  | UPPER_SNAKE | `MAX_TICKERS`               |
| Routes     | kebab-case  | `/api/backtest/monte-carlo` |

### Shared Types (`packages/shared/types/`)

- Barrel export from `packages/shared/types/index.ts`
- Import from specific module: `import { Portfolio } from './types/portfolio.js'`
- All interfaces need JSDoc comments explaining non-obvious fields

### Testing

- Vitest for unit/integration/contract/chaos/property tests
- Playwright for E2E UI tests
- Test files co-located in `tests/` top-level directory
- Coverage target: lines ≥80%, functions ≥80%, branches ≥70%, statements ≥80%（以 `scripts/check-coverage.mjs` 为权威源）

#### Test Commands

```powershell
pnpm test:unit              # Vitest unit tests (mocks, no DB)
pnpm test:integration       # Vitest integration tests (testcontainers; Docker for full coverage)
pnpm test:contract          # OpenAPI 3.0 contract conformance (coverage ≥95%)
pnpm test:chaos              # Chaos experiments (requires Docker + full application stack)
pnpm test:property           # Property-based invariant tests (fast-check, no Docker)
pnpm test:e2e:ui              # Playwright browser E2E (requires postgres + redis + engine-go + data-fetcher)
pnpm test:docker              # All Vitest tests with RUN_TESTCONTAINERS=1 (chaos + integration Docker paths)
````

#### Test Directories

- `tests/unit/` — Vitest unit tests (mocks, no DB)
- `tests/integration/` — Vitest integration tests (testcontainers PostgreSQL + Redis)
- `tests/contract/` — OpenAPI 3.0 contract conformance
- `tests/chaos/` — Chaos experiments (network partition, container restart; requires Docker)
- `tests/property/` — Property-based invariant tests (fast-check)
- `tests/e2e/ui/` — Playwright browser E2E
- `tests/helpers/` — Shared test fixtures and mocks

### Git

- Conventional Commits: `<type>(<scope>): <description>`
- Types: `feat` / `fix` / `refactor` / `chore` / `docs` / `test`
- Branches: `feature/*` / `fix/*` / `refactor/*` → PR → `main` (protected)
- Pre-commit: husky + lint-staged (eslint --fix + prettier --write)

## Key ADR References

| ADR     | Decision                                                        |
| ------- | --------------------------------------------------------------- |
| ADR-004 | Express over Fastify/NestJS                                     |
| ADR-007 | PostgreSQL over SQLite for horizontal scaling                   |
| ADR-008 | Go + TypeScript over 4-language architecture                    |
| ADR-013 | DDD aggregates + event sourcing in domain layer                 |
| ADR-014 | Outbox (LISTEN/NOTIFY + CDC) + consumer idempotency             |
| ADR-015 | OTel + pino + prom-client, SaaS backend (go-shared)             |
| ADR-016 | Circuit breakers + rate-limit fail-closed tiering               |
| ADR-017 | JWT + RBAC + task ownership + per-org API keys                  |
| ADR-018 | Redis + Sentinel HA (no memory degradation)                     |
| ADR-031 | Single Go engine fail-closed (no Node/Rust fallback)            |
| ADR-032 | Multi-tenant SaaS (RLS + persistence + BFF auth + registration) |
| ADR-036 | Stripe billing + per-plan quota + fair scheduling               |
| ADR-047 | Backend code organization (package merge + modularization)      |
| ADR-052 | CI tiering + dependency enforcement + SBOM + cosign             |
| ADR-053 | Node layer libraries (Pino + Zod + BullMQ)                      |

## Known Gotchas

1. **Go data service semaphore=10**: `dataQuery.ts` 中 `goServiceSemaphore = new Semaphore(10)` 限制并发 Go HTTP 调用（默认 10）。Python data CLI 已退役（原 api/python/ 已随 ADR-047 合并删除），admin bulk-ingest 端点返回 501。
2. **Single Go engine + fail-closed**: Go engine is the only backtest/MC/optimizer engine (Rust `engine-rs/` deleted). When unavailable, engine-canonical compute returns 503 + Retry-After (ADR-031); never silently Node-computed.
3. **x-api-key compat risk**: ADR-017 已支持按组织 API 密钥（哈希存储、可吊销、可审计，泄露爆炸半径收敛到单组织）。仅 `ADMIN_API_KEY` 作为平台 break-glass 静态凭证不可吊销，须严格保管并尽量少用。
4. **Redis dependency**: Auth module uses Redis for Refresh Tokens. Redis failure degrades to in-memory (single-instance only, multi-instance session inconsistent).
5. **CORS_ORIGINS=true in production**: 生产环境 hard-fail（拒绝启动），仅在开发环境降级为 warning + 允许所有源。生产部署必须配置 `CORS_ORIGINS` 白名单（逗号分隔），否则启动失败。
6. **RFC 7807 error format**: All API errors use `{ success: false, error: { type, title, status, code, detail } }`. Breaking change from legacy `{ code, message }`.
7. **API versioning**: All routes mounted at `/api/v1/`. Legacy `/api/` paths 已废弃；`Deprecation` + `Sunset` headers 仅用于 v1 内部端点迁移。
8. **Degraded mode (data service only)**: Data service degradation (PostgreSQL -> Go data-fetcher) includes `degraded: true` + `degradedWarning` in response. Engine unavailability is fail-closed (503 + Retry-After, NO degraded field) per ADR-031. Frontend must display data-service degraded warnings to users.

## API Patterns

- Response format: `{ success: boolean, data?: T, error?: ProblemDetails }`. Data service endpoints may include `degraded: boolean` + `degradedWarning: string` (PostgreSQL -> Go data-fetcher fallback). Engine endpoints are fail-closed 503 + Retry-After per ADR-031 (no degraded field).
- Auth: JWT Bearer token via `Authorization` header, or `x-api-key` header for legacy compat
- Compute endpoints (`/api/backtest/*`): rate-limited (10 req/min), require auth (optional during transition)
- Health endpoint: `GET /api/health` (no auth)
- All data endpoints: `/api/v1/data/*`
- Error type URI: `https://backtest.platform/errors/{error-code}`
