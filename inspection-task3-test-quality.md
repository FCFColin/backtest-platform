# Test Quality Inspection Report

**Date:** 2026-07-03
**Scope:** Full test quality audit of 回测平台

---

## 1. Test File Distribution

| Category          | Test Files |
| ----------------- | ---------: |
| unit/routes       |         22 |
| unit/utils        |         19 |
| unit/engine       |         19 |
| unit/services     |         14 |
| unit/domain       |         10 |
| unit/schemas      |         10 |
| unit/middleware   |         10 |
| unit/application  |          7 |
| e2e/ui            |          7 |
| tests/integration |          4 |
| unit/db           |          4 |
| tests/chaos       |          4 |
| unit/store        |          3 |
| unit/config       |          3 |
| unit/queues       |          3 |
| unit/api          |          2 |
| unit/hooks        |          2 |
| tests/benchmark   |          1 |
| unit/lib          |          1 |
| tests/fuzz        |          1 |
| tests/consistency |          1 |
| tests/contract    |          1 |
| unit/server       |          1 |
| **Total**         |    **151** |

---

## 2. Test Run Results

- **136 passed** (97.8% of test files)
- **2 failed** (integration tests)
- **1 skipped**
- **2496 tests passed**, 25 skipped, 0 failed (individual test level)
- **Duration:** 69.20s

### Failures:

1. `tests/integration/app-security.test.ts` — Failed to load url `../../api/app.js`. Path does not exist in current project structure (source is at `packages/backend/src/app.ts`).
2. `tests/integration/db.integration.test.ts` — Failed to load url `../../api/config/index.js`. Same root cause — stale import paths referencing non-existent `api/` directory.

**Result:** ❌ 2 integration tests broken due to stale import paths referencing removed `api/` directory.

---

## 3. Coverage Summary

### Source: `coverage/vitest/coverage-summary.json`

| Metric     | Actual | Target |     Status      |
| ---------- | -----: | -----: | :-------------: |
| Lines      |  3.50% |    70% |   ❌ CRITICAL   |
| Functions  | 17.42% |    70% |   ❌ CRITICAL   |
| Branches   | 46.38% |    60% | ❌ BELOW TARGET |
| Statements |  3.50% |    70% |   ❌ CRITICAL   |

**Note:** The vitest.config.ts defines per-file thresholds at lines=95%, functions=95%, branches=85%, statements=95% but with `include` patterns pointing to `packages/{frontend,backend}/src/`. The coverage-summary.json contains stale paths (`api/` and root `src/`) that no longer exist on disk — these paths likely correspond to a previous project structure or mapping that has since been reorganized. Current source code lives under `packages/backend/src/` and `packages/frontend/src/`.

### Coverage by Module (only files with >0% coverage):

| File                                  |  Lines | Functions | Branches |
| ------------------------------------- | -----: | --------: | -------: |
| `api/routes/backtestRoutes.ts`        | 98.54% |      100% |   90.69% |
| `api/utils/backtestResultCache.ts`    | 81.57% |      100% |   72.72% |
| `api/utils/compressBacktestResult.ts` | 68.88% |    71.42% |   42.85% |
| `api/middleware/validate.ts`          | 52.94% |       50% |     100% |
| `api/utils/errors.ts`                 |   100% |      100% |   66.66% |
| `api/utils/logSanitizer.ts`           |   100% |      100% |     100% |
| `api/schemas/backtest.ts`             |   100% |      100% |     100% |
| `api/db/macroData.ts`                 |  5.66% |        0% |     100% |

All other 86 tracked files show **0% coverage** across all metrics.

### Coverage Config Issues:

- `vitest.config.ts` coverage `include` patterns (`packages/frontend/src/**`, `packages/backend/src/**`) do NOT match the stale paths in coverage-summary.json (`api/`, root `src/`)
- This indicates the coverage report may be stale or was generated with different configuration
- **The 3.5% overall coverage is dangerously low regardless of path resolution**

---

## 4. Go Test Results

### engine-go

| Package                            | Result           | Duration |
| ---------------------------------- | ---------------- | -------: |
| `engine-go/cmd/server`             | ⚠️ No test files |        — |
| `engine-go/internal/analysis`      | ⚠️ No test files |        — |
| `engine-go/internal/engine`        | ✅ PASS          |   0.414s |
| `engine-go/internal/middleware`    | ✅ PASS          |   2.411s |
| `engine-go/internal/montecarlo`    | ✅ PASS          |   0.545s |
| `engine-go/internal/observability` | ⚠️ No test files |        — |
| `engine-go/internal/optimizer`     | ✅ PASS          |   0.589s |
| `engine-go/internal/server`        | ⚠️ No test files |        — |

### data-fetcher

| Package                               | Result           | Duration |
| ------------------------------------- | ---------------- | -------: |
| `data-fetcher`                        | ✅ PASS          |   4.756s |
| `data-fetcher/baostock`               | ✅ PASS          |   0.837s |
| `data-fetcher/cmd/bs_test`            | ⚠️ No test files |        — |
| `data-fetcher/cmd/worker`             | ⚠️ No test files |        — |
| `data-fetcher/internal/akshare`       | ⚠️ No test files |        — |
| `data-fetcher/internal/finnhub`       | ⚠️ No test files |        — |
| `data-fetcher/internal/httpclient`    | ⚠️ No test files |        — |
| `data-fetcher/internal/observability` | ⚠️ No test files |        — |
| `data-fetcher/internal/provider`      | ⚠️ No test files |        — |
| `data-fetcher/internal/twelvedata`    | ⚠️ No test files |        — |
| `data-fetcher/internal/yfinance`      | ⚠️ No test files |        — |

### Go Packages With NO Tests (12 total)

**engine-go (3):**

- `engine-go/cmd/server`
- `engine-go/internal/analysis`
- `engine-go/internal/observability`
- `engine-go/internal/server`

**data-fetcher (9):**

- `data-fetcher/cmd/bs_test`
- `data-fetcher/cmd/worker`
- `data-fetcher/internal/akshare`
- `data-fetcher/internal/finnhub`
- `data-fetcher/internal/httpclient`
- `data-fetcher/internal/observability`
- `data-fetcher/internal/provider`
- `data-fetcher/internal/twelvedata`
- `data-fetcher/internal/yfinance`

---

## 5. Test Type Completeness

| Type             | Exists  |             Files             |
| :--------------- | :-----: | :---------------------------: |
| Unit             |   ✅    | 137 files across 18 sub-areas |
| Integration      |   ✅    |      4 files (2 broken)       |
| E2E (Playwright) |   ✅    |            7 files            |
| Chaos            |   ✅    |            4 files            |
| Fuzz             |   ✅    |            1 file             |
| Consistency      |   ✅    |            1 file             |
| Contract         |   ✅    |            1 file             |
| Benchmark        |   ✅    |            1 file             |
| **Total types**  | **8/8** |                               |

All test types specified in AGENTS.md (unit, integration, consistency, contract, chaos, fuzz, benchmark, e2e) are present.

---

## 6. Missing Test Areas

### Frontend (`packages/frontend/src/`) — No Tests

| Directory               |                                                     Files                                                     |                            Status                            |
| ----------------------- | :-----------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------: |
| `utils/`                | 8 files (apiClient, authTokens, chartDataMerge, configApi, format, portfolioStorage, tickerPresets, urlState) |                         ❌ No tests                          |
| `hooks/`                |                   3 hooks (useAsyncAction, useChartInteractions, useEngineHealth, useTheme)                   | ⚠️ 2 test files for 4 hooks (useEngineHealth, useTheme only) |
| `store/`                |                            authStore, backtestStore, index, toastStore, asyncSlice                            |                ⚠️ 3 test files for 5+ modules                |
| `lib/`                  |                                                   utils.ts                                                    |                        ⚠️ 1 test file                        |
| `pages/`, `components/` |                                                     Many                                                      |          Excluded (E2E coverage, per vitest config)          |

### Backend (`packages/backend/src/`) — No or Inadequate Tests

| Directory                  |                                                                                          Status                                                                                          |
| -------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `application/`             |                                                            ⚠️ 7 test files — many application services still have 0% coverage                                                            |
| `engine/` (Node-canonical) | ⚠️ 19 test files but many engine modules (goalOptimizer, letf, monteCarlo, optimizer, pca, portfolio, rebalance, signal, statistics, tactical, tacticalGrid, seriesUtils) at 0% coverage |
| `services/`                |                              ⚠️ 14 test files but many services (apiKeyService, backtestRunRepo, indicatorService, invitationService, etc.) at 0% coverage                               |
| `middleware/`              |                                                        ⚠️ 10 test files but auth, jwtAuth, rbac, idempotency, etc. at 0% coverage                                                        |
| `routes/`                  |                                                          ⚠️ 22 test files but most routes except backtestRoutes at 0% coverage                                                           |
| `schemas/`                 |                                                                  ⚠️ 10 test files but only backtest schema has coverage                                                                  |
| `domain/`                  |                                                          ⚠️ 10 test files but aggregates, events, value-objects at 0% coverage                                                           |
| `config/`                  |                                                                     ⚠️ 3 test files but config logic at 0% coverage                                                                      |
| `db/`                      |                                                                      ⚠️ 4 test files but db modules at 0% coverage                                                                       |
| `queues/`                  |                                                                     ⚠️ 3 test files but queue modules at 0% coverage                                                                     |

### Go (`engine-go/`, `data-fetcher/`) — Missing Tests

| Package                               |   Status    |
| ------------------------------------- | :---------: |
| `engine-go/internal/analysis`         | ❌ No tests |
| `engine-go/internal/observability`    | ❌ No tests |
| `engine-go/internal/server`           | ❌ No tests |
| `engine-go/cmd/server`                | ❌ No tests |
| `data-fetcher/internal/akshare`       | ❌ No tests |
| `data-fetcher/internal/finnhub`       | ❌ No tests |
| `data-fetcher/internal/httpclient`    | ❌ No tests |
| `data-fetcher/internal/observability` | ❌ No tests |
| `data-fetcher/internal/provider`      | ❌ No tests |
| `data-fetcher/internal/twelvedata`    | ❌ No tests |
| `data-fetcher/internal/yfinance`      | ❌ No tests |
| `data-fetcher/cmd/worker`             | ❌ No tests |

### Integration Tests

- 2 of 4 integration tests are **broken** (stale import paths referencing non-existent `api/` directory)
- No integration tests for Go service interaction, data-fetcher API, or database migrations

---

## 7. Overall Assessment

### Summary

| Dimension          | Rating | Notes                                                               |
| ------------------ | :----: | ------------------------------------------------------------------- |
| Test Count (JS/TS) |   ✅   | 151 files, 2496 tests — good volume                                 |
| Test Pass Rate     |   ✅   | 97.8% file pass rate, 100% individual test pass rate                |
| Test Types         |   ✅   | All 8 types present                                                 |
| Coverage (JS/TS)   |   ❌   | 3.5% lines — far below 70% target                                   |
| Go Tests           |   ⚠️   | 4/8 engine-go packages, 2/11 data-fetcher packages have tests       |
| Integration Tests  |   ❌   | 2 of 4 are broken                                                   |
| Coverage Config    |   ❌   | vitest.config.ts include patterns may not match actual source paths |

### Critical Issues

1. **Coverage is 3.5% (target 70%)** — constitutes a regression risk. The 2496 passing unit tests primarily exercise small utility modules but leave the entire application layer (services, routes, middleware, engine) uncovered.
2. **Coverage config misalignment** — `vitest.config.ts` coverage `include` points to `packages/{frontend,backend}/src/` but the existing coverage-summary.json reports paths under `api/` and root `src/` which no longer exist. Investigation needed.
3. **2 integration tests are broken** — stale import paths referencing a deleted `api/` directory.
4. **Go test coverage is sparse** — 12 of 19 Go packages have zero tests, including all 6 data-fetcher provider implementations (akshare, finnhub, twelvedata, yfinance, httpclient) and engine server/analysis/observability.

### Recommendations

1. Fix integration test import paths (update `../../api/` references to `../../packages/backend/src/`)
2. Generate fresh coverage report and validate coverage include patterns match actual source layout
3. Add unit tests for frontend `utils/` modules (8 files, zero tests)
4. Add Go tests for data providers (akshare, finnhub, twelvedata, yfinance) — highest risk due to external API dependencies
5. Prioritize backend application layer coverage (services, routes, middleware) which currently sits at ~0%
6. Increase coverage in small increments toward the AGENTS.md targets (70/70/60/70) before attempting the vitest config's 95/95/85/95 thresholds
