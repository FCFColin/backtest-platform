# Performance Inspection Report

## 1. Frontend Lazy Loading

**Result: 35/35 pages lazy-loaded (100%)**

All page components in `packages/frontend/src/pages/` (31 pages + 4 admin sub-pages) are loaded via `React.lazy()` in `App.tsx:11-46`. Additionally, `BacktestPage.tsx:20-37` lazy-loads 18 chart/table sub-components (GrowthChart, DrawdownChart, etc.) to defer recharts and heavy visualization imports.

**Not lazy-loaded:** `Navbar`, `Footer`, `Toast`, `DegradedBanner`, `ErrorBoundary`, `ProtectedRoute` — these are shell-level components needed on every route and are correctly eagerly imported.

**Assessment:** Excellent. Code-splitting at both page and heavy-component level.

## 2. Vite Build Optimization

**Config:** `vite.config.ts`

| Setting                          | Value                                                                                                    | Assessment                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `manualChunks`                   | `react-vendor` (react, react-dom, react-router-dom), `chart-vendor` (recharts), `state-vendor` (zustand) | Good — separates vendor from app code for long-lived caching |
| `optimizeDeps.include`           | react, react-dom, react-router-dom, recharts, lucide-react, zustand, i18next, clsx, tailwind-merge       | Adequate — pre-bundles heavy deps in dev                     |
| Code splitting                   | Via `React.lazy()` (see §1)                                                                              | Full coverage                                                |
| Missing: CSS minification config | Tailwind CSS built-in (handled via postcss)                                                              | Acceptable                                                   |
| Missing: `target` override       | Not set (defaults to `modules`)                                                                          | Acceptable for modern browsers                               |
| Missing: `chunkSizeWarningLimit` | Not set (defaults to 500KB)                                                                              | Acceptable                                                   |

**Assessment:** Good basic optimization. No advanced features like `rollupOptions.plugins` for tree-shaking or `build.target` tuning.

## 3. Store Selector Granularity

**File:** `packages/frontend/src/store/backtestStore.ts`

- Zustand store with **single monolithic state object** (16 properties)
- Components subscribe to the whole store via `useBacktestStore()` or with inline selectors like `useBacktestStore((s) => s.isLoading)` in some places
- **Example of fine-grained selector:** `const initAuth = useAuthStore((s) => s.init)` in `App.tsx:126` — correct pattern
- **Risk:** No evidence of widespread selector misuse, but the monolithic store means any state update triggers re-render in all subscribers unless they use precise selectors

**Assessment:** Acceptable. The store is moderate in size. No `createSelector` or `shallow` usage detected (fine for current scale). For larger stores, consider slicing into smaller stores or using `useShallow` (zustand v4.4+).

## 4. DB Query Patterns

**File:** `packages/backend/src/services/`

### Pagination Coverage

All list endpoints implement LIMIT/OFFSET pagination with safe defaults:

- `apiKeyService.ts:170` — `LIMIT $2 OFFSET $3`
- `backtestRunRepo.ts:74` — `LIMIT $1 OFFSET $2`
- `portfolioRepo.ts:77` — `LIMIT $1 OFFSET $2`
- `savedConfigRepo.ts:63` — `LIMIT $1 OFFSET $2`
- `invitationService.ts:114` — `LIMIT $2 OFFSET $3`
- `membershipService.ts:173` — `LIMIT $2 OFFSET $3`
- `dataManageRoutes.ts:84-87` — page-based with `LIMIT/OFFSET`
- `ticker search` — `engineService.ts:75` — `slice(0, 30)` in-memory, but upstream `LIMIT 500` is safe
- `validateTickers` — single `ANY($1)` query (batch), no N+1

### N+1 Risk Analysis

- **`dataService.ts:359-380`** — `stillMissing.map(async ticker => ...)` — per-ticker Go data service calls for missing tickers. **Medium risk.** Limited by `goServiceSemaphore=10` (hard-coded concurrency). If many tickers are missing, this generates N sequential-ish calls.
- **`engineService.ts:65-75`** — `searchTickers()` fetches all 500 via `getTickerList()`, then filters/slices in-memory. Not an N+1 but a pattern that loads more data than needed. Could use PostgreSQL `ILIKE` / `to_tsvector` directly instead.
- **`dataService.ts:320-324`** — `ticker = ANY($1)` single-query batch read. Correct pattern, no N+1.
- **`vue/component loops`** — No evidence of per-row DB calls inside loops.

### Connection Pool

- `DB_POOL_MAX=20`, `DB_POOL_MIN=2`, `statement_timeout=10000ms`
- Read-replica pool via `getReadPool()` when `DATABASE_READ_URL` configured
- Writes use primary pool. Both use `pg.Pool` with idle timeout 30s, connection timeout 5s.

**Assessment:** Good pagination coverage. Minimal N+1 risk (only in the Go data-fetcher fallback path, which is concurrency-limited).

## 5. Caching Strategy

### Backend Caching Layers

| Layer                      | Mechanism                                                  | Scope                                            | TTL                         |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | --------------------------- |
| In-memory LRU              | `backtestResultCache.ts` — `Map<string, CacheEntry>`       | Full backtest results                            | 5 min, max 50 entries       |
| File-based cache           | `dataService.ts` — `CACHE_DIR` + version file              | Price data cache                                 | Version-driven invalidation |
| Redis (planned)            | `dataService.ts:540-543` — `priceCacheRedisAvailable` flag | Price data (active code exists but may be gated) | Configurable                |
| PostgreSQL circuit breaker | `dataService.ts:83-98` — `pgCircuitBreaker`                | DB query cache (via opossum state)               | resetTimeout: 10s           |
| Go engine circuit breaker  | `engineClient.ts:76` — `goCircuitBreaker`                  | Engine call cache (fail-fast)                    | resetTimeout: 30s           |

### Key Observations

1. **`backtestResultCache.ts`** — Manual LRU via `Map` (not a proper LRU library). Uses delete+re-insert for LRU reordering (amortized O(1), but `Map` iteration order reflects insertion order, so oldest entries aren't automatically evicted first — `cache.keys().next()` deletes the first inserted, not the least-recently-used). **Minor correctness issue:** The "LRU" is effectively FIFO.

2. **Price data caching** — Dual system: file-based (`writeCache`) + Redis attempt. Redis fallback auto-detects availability (`priceCacheRedisAvailable`).

3. **Circuit breakers** — opossum-based for both PostgreSQL queries and Go engine calls. Good for fault isolation.

4. **No HTTP-level caching** — No `Cache-Control`, `ETag`, or `If-None-Match` headers detected on API responses.

**Assessment:** Multi-layer caching is good. The in-memory backtest result cache has a minor LRU correctness issue (FIFO behavior). No response caching on GET endpoints.

## 6. Engine Timeout & Circuit Breaker Config

**File:** `packages/backend/src/utils/engineClient.ts`

### Config

| Parameter                  | Value           | Location               |
| -------------------------- | --------------- | ---------------------- |
| `ENGINE_TIMEOUT_MS`        | `5000` (5s)     | `config/index.ts:99`   |
| `BACKTEST_SYNC_TIMEOUT_MS` | `120000` (2min) | `config/index.ts:285`  |
| Frontend abort timeout     | `180000` (3min) | `backtestStore.ts:228` |

### Circuit Breaker (opossum)

| Parameter                  | Value                                      |
| -------------------------- | ------------------------------------------ |
| `timeout`                  | `5000ms` (matches ENGINE_TIMEOUT_MS)       |
| `errorThresholdPercentage` | `50` (50% failure rate triggers open)      |
| `resetTimeout`             | `30000` (30s in Half-Open)                 |
| `volumeThreshold`          | `5` (minimum requests before stats matter) |
| `rollingCountTimeout`      | `60000` (60s window)                       |
| `rollingCountBuckets`      | `10` (6s per bucket)                       |

### Retry Policy

- `retryWithBackoff()` — max 2 retries, base delay 200ms, exponential backoff (200ms, 400ms) + random jitter (±100ms)
- Retries only apply to **idempotent** operations (backtest calculations are pure/computational)
- Non-idempotent paths bypass retry

### Fail-Closed

- `EngineUnavailableError` with `retryAfterSeconds=30`
- `callEngineStrict()` never silently degrades to Node — returns 503 per ADR-031
- `resetEngineAvailability()` exposed for health check integration

**Assessment:** Well-configured circuit breaker with appropriate timeouts, retry, and fail-closed behavior. The 5s engine timeout is aggressive but appropriate for compute calls. The frontend-level 3min abort covers the sync backtest endpoint's 2min timeout.

## 7. Overall Assessment

### Strengths

- **100% lazy-loaded pages** — ideal code splitting
- **All list endpoints paginated** — no unbounded queries
- **Multi-layer caching** — in-memory LRU, file cache, circuit breakers (opossum)
- **Read-replica support** — configured via `DATABASE_READ_URL`
- **Batch queries** — `ticker = ANY($1)` avoids N+1 for price data and validation
- **Well-configured engine circuit breaker** — 5s timeout, 50% threshold, exponential backoff retry, fail-closed
- **Statement timeout** — 10s PostgreSQL `statement_timeout` prevents slow query connection exhaustion
- **Connection pool limits** — 20 max connections with 2 min idle

### Issues & Recommendations

| #   | Severity | Issue                                                                  | Recommendation                                                                                   |
| --- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Low      | In-memory LRU is effectively FIFO (`backtestResultCache.ts`)           | Use a proper LRU library (e.g., `lru-cache`) or fix eviction to track access order               |
| 2   | Low      | `searchTickers()` loads all 500 then filters in-memory                 | Use PostgreSQL `ILIKE` or `to_tsvector @@ plainto_tsquery()` for server-side search              |
| 3   | Low      | No HTTP caching headers on API responses                               | Add `Cache-Control: max-age=60` + `ETag` on stable GET endpoints (ticker list, etc.)             |
| 4   | Info     | Monolithic Zustand store could cause excess re-renders                 | Consider `useShallow` selectors or store slicing for frequently-updating fields like `isLoading` |
| 5   | Info     | Per-ticker Go data fetcher fallback has semaphore=10 concurrency limit | Acceptable — only triggers for missing tickers, which should be rare in steady state             |
| 6   | Info     | No build-time CSS purging config for Tailwind                          | Default Vite + Tailwind handles this, but verify `content` paths in tailwind config              |

**Conclusion:** The platform is well-optimized for current scale. No critical performance bottlenecks identified. The top actionable item is fixing the LRU cache eviction (#1) for correctness. Monitoring query patterns after scale (100+ concurrent users) would reveal if the N+1 fallback path or search-ticker query becomes a bottleneck.
