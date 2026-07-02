# Agent Guide — 回测平台 (Backtest Platform)

## Quick Start

```powershell
npm install          # Install dependencies
npm run dev          # Start frontend (5173) + backend API (5001)
npm run check        # TypeScript type check (tsc --noEmit)
npm run lint         # ESLint
npm run test         # Vitest (all tests)
npm run test:unit    # Unit tests only
```

## Tech Stack

| Layer                   | Technology                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Frontend                | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Zustand + Recharts               |
| Backend API             | Express 4 + TypeScript (ESM) + tsx                                                 |
| Engine (only)           | Go (engine-go, gin + gonum) — Rust/Node fallbacks retired (ADR-008/031)            |
| Engine (Node-canonical) | Node.js (api/engine/) for tactical/tacticalGrid/signal/goalOptimizer/pca/letf only |
| Data service (primary)  | Go (data-fetcher, gin)                                                             |
| Data service (fallback) | Go data-fetcher (live fetch for missing tickers)                                   |
| Database                | PostgreSQL (pg, node-postgres)                                                     |
| Cache/Auth              | Redis (ioredis + BullMQ)                                                           |
| Validation              | Zod (zod v4)                                                                       |
| Observability           | pino + OpenTelemetry + prom-client                                                 |

## Architecture

- **4 services, 2 languages (TS/Go)**: Frontend → Express API → Go engine + Go data service
- **Degradation**: Engine: Go → fail-closed 503 (ADR-031); Data: PostgreSQL → Go data-fetcher (missing tickers only). JSON files are import-only (`npm run import:tickers`), not runtime fallback.
- Full topology: `docs/ARCHITECTURE.md`
- All ADRs: `docs/adr/` (18 records covering all significant decisions)

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

### Shared Types (`shared/types/`)

- Barrel export from `shared/types/index.ts`
- Import from specific module: `import { Portfolio } from './types/portfolio.js'`
- All interfaces need JSDoc comments explaining non-obvious fields

### Testing

- Vitest for unit/integration/consistency/contract/chaos/fuzz/bench tests
- Playwright for E2E UI tests
- Test files co-located in `tests/` top-level directory
- Coverage target: lines ≥70%, functions ≥70%, branches ≥60%, statements ≥70%

### Git

- Conventional Commits: `<type>(<scope>): <description>`
- Types: `feat` / `fix` / `refactor` / `chore` / `docs` / `test`
- Branches: `feature/*` / `fix/*` / `refactor/*` → PR → `main` (protected)
- Pre-commit: husky + lint-staged (eslint --fix + prettier --write)

## Key ADR References

| ADR     | Decision                                               |
| ------- | ------------------------------------------------------ |
| ADR-004 | Express over Fastify/NestJS                            |
| ADR-007 | PostgreSQL over SQLite for horizontal scaling          |
| ADR-008 | Go + TypeScript over 4-language architecture           |
| ADR-009 | Zod over Joi/class-validator for runtime validation    |
| ADR-013 | DDD aggregates + event sourcing in domain layer        |
| ADR-016 | Circuit breakers via opossum (Node) + gobreaker (Go)   |
| ADR-017 | JWT + RBAC (3 roles × 7 permissions), x-api-key compat |
| ADR-018 | Redis for distributed session/rate-limit/cache         |

## Known Gotchas

1. **Go data service semaphore=10**: `dataService.ts` `goServiceSemaphore` limits concurrent Go HTTP calls (default 10). Python data CLI (`api/python/`) is retired; admin bulk-ingest endpoints return 501.
2. **Single Go engine + fail-closed**: Go engine is the only backtest/MC/optimizer engine (Rust `engine-rs/` deleted). When unavailable, engine-canonical compute returns 503 + Retry-After (ADR-031); never silently Node-computed.
3. **x-api-key compat risk**: Static API keys (analyst role) cannot be revoked if leaked.
4. **Redis dependency**: Auth module uses Redis for Refresh Tokens. Redis failure degrades to in-memory (single-instance only, multi-instance session inconsistent).
5. **CORS_ORIGINS=true in production**: Logs a warning but allows all origins. Configure CORS_ORIGINS whitelist for production.
6. **RFC 7807 error format**: All API errors use `{ success: false, error: { type, title, status, code, detail } }`. Breaking change from legacy `{ code, message }`.
7. **API versioning**: All routes mounted at `/api/v1/`. Legacy `/api/` paths have `Deprecation` + `Sunset` headers for 6-month transition.
8. **Degraded mode**: When engine/data falls back, response includes `degraded: true` + `degradedWarning`. Frontend must display this to users.

## API Patterns

- Response format: `{ success: boolean, data?: T, error?: ProblemDetails, degraded?: boolean, degradedWarning?: string }`
- Auth: JWT Bearer token via `Authorization` header, or `x-api-key` header for legacy compat
- Compute endpoints (`/api/backtest/*`): rate-limited (10 req/min), require auth (optional during transition)
- Health endpoint: `GET /api/health` (no auth)
- All data endpoints: `/api/v1/data/*`
- Error type URI: `https://backtest.platform/errors/{error-code}`
