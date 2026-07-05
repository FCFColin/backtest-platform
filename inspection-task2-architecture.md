# Architecture Consistency Inspection — Task 2

**Date:** 2026-07-03  
**Inspector:** opencode  
**Scope:** Domain layer purity, API versioning, middleware chains, degradation mode, RFC 7807, RBAC

---

## 1. DDD Layer Dependency Check

### Domain Layer (`packages/backend/src/domain/`)

| File                           | Imports from services/routes/middleware? |
| ------------------------------ | ---------------------------------------- |
| `aggregates/portfolio.ts`      | ✅ None — only imports value objects     |
| `events/*.ts` (5 files)        | ✅ None                                  |
| `value-objects/*.ts` (5 files) | ✅ None                                  |

**Result: 0 violations.** Domain layer is pure — no infrastructure dependencies.

### Application Layer (`packages/backend/src/application/`)

| File                               | Violation                                                               | Line |
| ---------------------------------- | ----------------------------------------------------------------------- | ---- |
| `backtest-service.ts`              | `import { writeEventInTransaction } from '../services/outboxWriter.js'` | 12   |
| `grid-application-service.ts`      | `import { fetchHistoryData } from '../services/dataService.js'`         | 4    |
| `optimizer-application-service.ts` | `import { fetchHistoryData } from '../services/dataService.js'`         | 6    |

**Result: 3 violations.** Application layer depends on infrastructure (`services/`).  
**Severity:** LOW — these are data-fetching concerns, but DDD purists would route through repository interfaces.

---

## 2. API Versioning

### `/api/v1/` Routes (all mounted in `app.ts`)

| Route                        | Mounted                                  |
| ---------------------------- | ---------------------------------------- |
| `/api/v1/data`               | ✅ `app.use('/api/v1/data', dataRoutes)` |
| `/api/v1/data/manage`        | ✅                                       |
| `/api/v1/backtest`           | ✅                                       |
| `/api/v1/backtest-optimizer` | ✅                                       |
| `/api/v1/tactical`           | ✅                                       |
| `/api/v1/pca`                | ✅                                       |
| `/api/v1/signal`             | ✅                                       |
| `/api/v1/letf`               | ✅                                       |
| `/api/v1/tactical-grid`      | ✅                                       |
| `/api/v1/goal-optimizer`     | ✅                                       |
| `/api/v1/admin`              | ✅                                       |
| `/api/v1/auth`               | ✅                                       |
| `/api/v1/keys`               | ✅                                       |
| `/api/v1/portfolios`         | ✅                                       |
| `/api/v1/configs`            | ✅                                       |
| `/api/v1/runs`               | ✅                                       |
| `/api/v1/orgs`               | ✅                                       |
| `/api/v1/billing`            | ✅                                       |
| `/api/v1/jobs`               | ✅ (via jobRoutes)                       |
| `/api/v1/debug`              | ✅                                       |

**v1 count:** 20 route groups.

### Legacy Paths (`/api/xxx` — via `deprecateRoute()`)

All 18 legacy routes registered with `Deprecation: true` + `Sunset` + `Link` headers (RFC 8594).  
Complete list checked — no missing routes. ✅

**Deprecation pattern:**

```ts
function deprecateRoute(path, v1Path, ...handlers);
```

Sets `Deprecation: true`, `Sunset: <6-months>`, `Link: </api/v1/...>; rel="successor-version"`.

**Result: PASS.** All expected legacy routes covered.

---

## 3. Middleware Chain Completeness

### Compute Endpoints (app.ts mounts)

| Endpoint                     | Chain                                                                                      | Complete?     |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| `/api/v1/backtest`           | computeAuth → resolveTenant → computePermission(BACKTEST_RUN) → computeQuota → auditLog    | ✅            |
| `/api/v1/backtest-optimizer` | computeAuth → resolveTenant → computePermission(OPTIMIZER_RUN) → computeQuota → auditLog   | ✅            |
| `/api/v1/tactical`           | computeAuth → resolveTenant → computePermission(STRATEGY_MANAGE) → computeQuota → auditLog | ✅            |
| `/api/v1/pca`                | computeAuth → resolveTenant → computePermission(BACKTEST_RUN) → computeQuota → auditLog    | ✅            |
| `/api/v1/signal`             | computeAuth → resolveTenant → computePermission(SIGNAL_READ) → auditLog                    | ✅ (no quota) |
| `/api/v1/letf`               | computeAuth → resolveTenant → computePermission(BACKTEST_RUN) → computeQuota → auditLog    | ✅            |
| `/api/v1/tactical-grid`      | computeAuth → resolveTenant → computePermission(STRATEGY_MANAGE) → computeQuota → auditLog | ✅            |
| `/api/v1/goal-optimizer`     | computeAuth → resolveTenant → computePermission(STRATEGY_MANAGE) → computeQuota → auditLog | ✅            |

**Non-compute endpoints:** `/admin`, `/keys`, `/portfolios`, `/configs`, `/runs`, `/orgs`, `/billing`, `/data/manage` — all have appropriate jwtAuth → resolveTenant → requirePermission → auditLog chains. ✅

**Route-level middleware:** Individual route files only add `validate(schema)` at handler level. No redundant auth/redundant auth at route level.

**Edge case:** `tacticalRoutes.ts:/alerts` uses `requireApiKey` directly — this is intentional (alerts configured via API key, not session).

**Result: PASS.** All chains are complete.

---

## 4. Degradation Mode

### Engine (ADR-031 — fail-closed)

**File:** `packages/backend/src/utils/engineClient.ts`

- **Circuit breaker:** opossum (`goCircuitBreaker`)
  - Timeout: `ENGINE_TIMEOUT_MS` (from config)
  - Error threshold: 50%
  - Reset timeout: 30s
  - Volume threshold: 5
  - Rolling window: 60s, 10 buckets
- **Retry:** Exponential backoff with jitter (max 2 retries, base 200ms)
- **Fail behavior:** `callEngineStrict()` → on failure → `EngineUnavailableError` → 503 + `Retry-After: 30`
- **No silent Node fallback** (confirming ADR-031 compliance)

**Result: ✅ Fail-closed for engine-canonical endpoints (backtest, MC, optimization, efficient-frontier, analysis).**

### Data Service (ADR-008 — degraded mode with fallback)

**File:** `packages/backend/src/services/dataService.ts`

- **Circuit breaker (PostgreSQL):** opossum (`pgCircuitBreaker`)
  - Timeout: 10s, error threshold: 50%, reset timeout: 10s
- **Fallback chain:** PostgreSQL → Go data-fetcher (missing tickers only) → mock (search only)
- **Redis cache:** Dual-write (Redis + memory), degrades to memory-only on Redis failure
- **Semaphore:** 10 concurrent Go data-fetcher calls

**Result: ✅ Degraded mode with graceful fallback for data, engine is fail-closed.**

### Frontend Consumption

| File                                   | Usage                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| `store/degradedStore.ts`               | Zustand store with `degraded: boolean` + `degradedWarning: string` |
| `components/DegradedBanner.tsx`        | Top banner shown when `degraded === true`                          |
| `store/backtestStore.ts:206-207`       | Reads `degraded`/`degradedWarning` from API response → shows toast |
| `hooks/useEngineHealth.ts`             | `EngineStatus` type includes `'degraded'`                          |
| `components/EngineStatusIndicator.tsx` | Shows degraded icon when engine is down                            |
| `pages/admin/AdminDashboard.tsx`       | `mapServiceStatus` maps `'unhealthy'` → `'degraded'`               |
| `pages/admin/SystemMonitor.tsx`        | Degraded status label for monitoring                               |

**Result: ✅ Frontend fully consumes degraded signals.**

---

## 5. RFC 7807 Compliance

### Implementation (`packages/backend/src/utils/errors.ts`)

| Field      | Present? | Example                                   |
| ---------- | -------- | ----------------------------------------- |
| `type`     | ✅       | `https://backtest.platform/errors/{code}` |
| `title`    | ✅       | Human-readable title                      |
| `status`   | ✅       | HTTP status code                          |
| `code`     | ✅       | Application-specific error code           |
| `detail`   | ✅       | Detailed message (hidden in production)   |
| `instance` | ✅       | `res.req?.path`                           |

### `sendProblem()` helper

- Sets `Content-Type: application/problem+json`
- Supports custom headers (e.g., `Retry-After` for engine fail-closed)
- Response format: `{ type, title, status, code, detail, instance }`

### Global error handlers

| Handler                              | RFC 7807?                                              |
| ------------------------------------ | ------------------------------------------------------ |
| Global error handler (app.ts:765)    | ✅                                                     |
| 404 handler (app.ts:792)             | ✅                                                     |
| Rate limit messages (all 3 limiters) | ✅ (but wrapped in `{ success: false, error: {...} }`) |

**Wrapping note:** The API response envelope wraps RFC 7807 body as `{ success: false, error: { type, title, status, code, detail } }` rather than returning the Problem Detail as the top-level body. This is the documented API contract and matches AGENTS.md `{ success: boolean, data?: T, error?: ProblemDetails }`.

**Result: ✅ Compliant with RFC 7807 via `{ success: false, error: ProblemDetails }` envelope.**

---

## 6. RBAC Matrix

### Roles (3)

| Role       | Key        |
| ---------- | ---------- |
| `ADMIN`    | `admin`    |
| `ANALYST`  | `analyst`  |
| `READONLY` | `readonly` |

### Permissions (7)

| Permission        | Key               | Used By                                                          |
| ----------------- | ----------------- | ---------------------------------------------------------------- |
| `BACKTEST_RUN`    | `backtest:run`    | `/backtest`, `/pca`, `/letf`, `/portfolios`, `/configs`, `/runs` |
| `DATA_MANAGE`     | `data:manage`     | `/data/manage`                                                   |
| `DATA_READ`       | `data:read`       | `/data/manage` (read access)                                     |
| `ADMIN_ACCESS`    | `admin:access`    | `/admin`, `/keys`                                                |
| `OPTIMIZER_RUN`   | `optimizer:run`   | `/backtest-optimizer`                                            |
| `SIGNAL_READ`     | `signal:read`     | `/signal`                                                        |
| `STRATEGY_MANAGE` | `strategy:manage` | `/tactical`, `/tactical-grid`, `/goal-optimizer`                 |

### Role → Permission Mapping

| Role         | BACKTEST_RUN | DATA_MANAGE | DATA_READ | ADMIN_ACCESS | OPTIMIZER_RUN | SIGNAL_READ | STRATEGY_MANAGE |
| ------------ | ------------ | ----------- | --------- | ------------ | ------------- | ----------- | --------------- |
| **ADMIN**    | ✅           | ✅          | ✅        | **✅**       | ✅            | ✅          | ✅              |
| **ANALYST**  | ✅           | ✅          | ✅        | ❌           | ✅            | ✅          | ✅              |
| **READONLY** | ❌           | ❌          | ✅        | ❌           | ❌            | ✅          | ❌              |

**Verification against AGENTS.md:** "3 roles × 7 permissions" — confirmed. ✅

### Org-role resolution

- `effectiveRole()` in rbac.ts: prioritizes `org_role` from JWT (maps `owner` → `admin`)
- Falls back to legacy `role` field for migration compatibility
- `platform_admin: true` bypasses all permission checks

**Result: ✅ RBAC matrix correct and fully wired.**

---

## Overall Assessment

| Dimension             | Status                      | Issues                                                                                                |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| **DDD Layer Purity**  | ⚠️ PASS WITH MINOR CONCERNS | 3 application → services imports (low severity)                                                       |
| **API Versioning**    | ✅ PASS                     | 20 v1 routes + 18 legacy deprecations, all covered                                                    |
| **Middleware Chains** | ✅ PASS                     | Complete auth → RBAC → quota → audit chains on all compute endpoints                                  |
| **Degradation Mode**  | ✅ PASS                     | Engine: fail-closed (503 + Retry-After); Data: circuit breaker + fallback; Frontend: full consumption |
| **RFC 7807 Errors**   | ✅ PASS                     | Full implementation via `sendProblem()`, envelope: `{ success: false, error: ProblemDetails }`        |
| **RBAC**              | ✅ PASS                     | 3 roles × 7 permissions, correctly mapped and wired                                                   |

### Recommendations

1. **Application layer violations:** Consider extracting `fetchHistoryData` behind a repository interface/port (e.g., `DataServicePort`) injected into application services. Low priority — current code works, but violates DDD strict layering.
2. **Engine circuit breaker** could retry more aggressively (currently 2 retries — reasonable for 503s, but worth monitoring).
3. **Rate limit passOnStoreError** is correctly `false` for compute/auth (fail-closed per ADR-020), `true` for admin (fail-open).
