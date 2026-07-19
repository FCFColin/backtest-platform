# PR: Code Simplification — Round 1-4

## Summary

7 commits reducing codebase complexity by fixing bugs, cleaning dead code,
consolidating duplicate logic, and simplifying architecture.

## Commits

| #   | Commit                                                            | Scope   | Net Lines |
| --- | ----------------------------------------------------------------- | ------- | --------- |
| 1   | `fix(test): correct initSchema import paths`                      | 3 files | +79/-35   |
| 2   | `refactor(test): consolidate backtest fixtures`                   | 2 files | +445/-15  |
| 3   | `refactor(backend): remove dead barrel files + unused re-exports` | 4 files | +40/-295  |
| 4   | `refactor(frontend): remove unused exports + dead re-exports`     | 4 files | +587/-166 |
| 5   | `refactor(frontend): inline single-use DataEngine components`     | 2 files | +153/-594 |
| 6   | `refactor(backend): consolidate route middleware factories`       | 1 file  | +52/-357  |
| 7   | `chore: relocate doc + inline Go pkg comment`                     | 2 files | +217/-0   |

**Total: ~1,573 lines added, ~1,462 lines removed**

## Bug Fixes

- **3 integration test files** were failing with `TypeError: initSchema is not a function`
  due to wrong import path (`pool.js` → `migrations.js`). All now pass.
- **1 unit test** (`barrel-exports.test.ts`) was failing after barrel file removal.
  Fixed to import directly from source files.
- **1 portfolio route test** was failing due to missing `rollingReturns` field
  in consolidated fixture. Fixed with proper override.
- **1 ESLint error** in `RegressionChart.tsx` fixed by splitting inline type import.

## Dead Code Removed

- **3 domain barrel files** (`aggregates/index.ts`, `value-objects/index.ts`,
  `services/index.ts`) with zero consumers
- **7 unused re-exports** from `refreshToken.ts` (6 constants + 2 types)
- **4 unused type re-exports** from `backtestStore.ts`
- **2 unnecessary `export` keywords** on internal sub-components
- **1 nonexistent file reference** in `knip.json`

## Files Merged

- `DataEngineLoading.tsx` (47 lines) → into `DataEnginePage.tsx`
- `DataEnginePresets.tsx` (27 lines) → into `DataEnginePage.tsx`
- `DataEngineActions.tsx` (60 lines) → into `DataEngineDashboard.tsx`
- `engine-go/tactical.go` (5 lines) → into `types.go`
- `backtestRoutesFixtures:createMockBacktestResult()` → `storeFixtures:mockBacktestResult()`

## Architecture

- Added `crudMiddleware()` + `computeMiddlewareNoQuota()` factory functions
  in `app.ts`, replacing 8 inline middleware chains with 2 factory calls.
- Moved `application-layer-contract.md` from `src/application/README.md` to `docs/`.
