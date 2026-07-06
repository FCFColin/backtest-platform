# Code Simplification Plan: 回测平台

## Overview

The backtest platform is a mature monorepo with ~1200 source files across TypeScript and Go. The codebase is well-architected (DDD, OpenTelemetry, comprehensive testing), but has accumulated complexity from its growth. This plan identifies concrete simplification opportunities, ordered by impact-to-effort ratio.

## Architecture Decisions

- **Preserve behavior exactly**: Every change must pass the existing 180+ test suite
- **Follow conventions**: Match the project's ESM, Zod, Tailwind, Zustand patterns
- **One change at a time**: Each task is independently verifiable
- **Stay scoped**: No drive-by refactors outside the named files

---

## Phase 1: Mega Page De-duplication (High Impact, Frontend)

The `src/pages/` directory has 11 files over 800 lines that are monolithic components. Meanwhile, `packages/frontend/src/pages/` has a thinner, better-structured mirror. The migration is incomplete.

### Task 1.1: De-duplicate `src/` ↔ `packages/frontend/src/`

**Description:** The codebase has near-identical frontend code in two locations (`src/` and `packages/frontend/src/`). Both coexist — one is legacy, one is the target structure. Either complete the migration to `packages/frontend/` and remove `src/`, or reconcile and keep one canonical version.

**Risks:**

- Build tooling may still reference `src/` (check `vite.config.ts`, `tsconfig.frontend.json`)
- E2E tests may import from `src/` paths

**Acceptance criteria:**

- [ ] Build succeeds with only one canonical source
- [ ] All 7 Playwright E2E tests pass
- [ ] `src/pages/MonteCarloPage.tsx` (1644 lines) and other mega pages resolved

**Dependencies:** None
**Estimated scope:** Large (entire frontend restructure)

### Task 1.2: Split `MonteCarloPage.tsx` (1644 lines)

**Description:** The single largest file in the project. Should be split into Params, Results, Presets components with a state hook, matching the `packages/frontend/` structure which already does this.

**Acceptance criteria:**

- [ ] Page delegates to `<MonteCarloParams />`, `<MonteCarloResults />`, `<MonteCarloPresets />`
- [ ] State extracted to `useMonteCarloState` hook
- [ ] Each sub-component < 300 lines

**Dependencies:** Task 1.1
**Estimated scope:** Medium

### Task 1.3: Split remaining mega pages (8 files)

**Description:** Same pattern for EfficientFrontierPage (1282), TacticalPage (1159), OptimizerPage (1041), CalculatorsPage (940), RebalancingSensitivityPage (927), BacktestOptimizerPage (904), TacticalGridPage, and any others >500 lines.

**Acceptance criteria:**

- [ ] Each page < 300 lines, delegating to feature sub-components
- [ ] State extracted to per-feature hooks
- [ ] No loss of functionality

**Dependencies:** Task 1.1
**Estimated scope:** Large (batch of 8 files)

---

## Phase 2: Backend Duplicate Elimination

### Task 2.1: De-duplicate `api/` ↔ `packages/backend/src/`

**Description:** Same pattern as frontend — `api/` and `packages/backend/src/` are near-identical mirrors (~160 files each). The package version is the target. Complete migration, update `package.json` scripts and imports, then remove `api/`.

**Acceptance criteria:**

- [ ] All unit/integration tests pass
- [ ] `npm run dev` starts successfully
- [ ] `api/` directory removed after verification

**Dependencies:** None
**Estimated scope:** Large (entire backend restructure)

---

## Phase 3: Mega Component Simplification

### Task 3.1: Split `DataEngineDashboard.tsx` (681 lines)

**Description:** Large monolithic dashboard component. Split into sub-components by feature area.

**Acceptance criteria:**

- [ ] Components grouped by responsibility (presets, results, config, etc.)
- [ ] Each sub-component < 250 lines
- [ ] No prop drilling — use composition or context

**Dependencies:** Task 1.1
**Estimated scope:** Medium

### Task 3.2: Split `AnalysisCharts.tsx` (~900-1055 lines)

**Description:** Chart component aggregator that likely contains chart logic + layout. Extract chart rendering logic into dedicated components.

**Acceptance criteria:**

- [ ] Chart wrappers separated from layout logic
- [ ] Each chart component < 200 lines
- [ ] Recharts usage is idiomatic

**Dependencies:** Task 1.1
**Estimated scope:** Medium

### Task 3.3: Simplify `Navbar.tsx` (378 lines)

**Description:** Navigation component likely contains too much inline logic. Extract menu rendering and auth state into helpers.

**Acceptance criteria:**

- [ ] Menu item rendering extracted to sub-components
- [ ] Auth state logic simplified
- [ ] No duplicated menu config arrays

**Dependencies:** Task 1.1
**Estimated scope:** Small

---

## Phase 4: Go Engine Simplification

### Task 4.1: Simplify `optimizer.go` (947 lines)

**Description:** Largest Go file. Portfolio optimization with multiple solver backends. Extract solver logic into separate packages.

**Acceptance criteria:**

- [ ] Solvers extracted to `internal/optimizer/solvers/` sub-package
- [ ] `optimizer.go` reduced to < 400 lines (orchestration only)
- [ ] All 537 test lines still pass
- [ ] No behavioral changes to optimization results

**Dependencies:** None
**Estimated scope:** Medium

### Task 4.2: Simplify `backtest.go` (778 lines)

**Description:** Core backtest engine. Extract rebalance logic, drawdown calculation, and statistics into focused functions or separate files.

**Acceptance criteria:**

- [ ] Core backtest loop < 300 lines
- [ ] Statistics, drawdown, rebalance extracted to their own modules
- [ ] Consistency tests (TS↔Go engine parity) still pass

**Dependencies:** None
**Estimated scope:** Medium

### Task 4.3: Simplify `montecarlo.go` (790 lines)

**Description:** Monte Carlo simulation engine. Extract bootstrap logic, distribution fitting, and result aggregation.

**Acceptance criteria:**

- [ ] Simulation core < 350 lines
- [ ] Distribution fitting extracted
- [ ] All 198 MC tests pass

**Dependencies:** None
**Estimated scope:** Medium

---

## Phase 5: TypeScript Engine Simplification

### Task 5.1: Simplify `backtestRunner.ts` (588 lines)

**Description:** TS-side backtest runner. Extract rebalance, statistics, and series utilities.

**Acceptance criteria:**

- [ ] Runner < 250 lines
- [ ] Utilities extracted to focused modules
- [ ] All backtest unit tests pass

**Dependencies:** None
**Estimated scope:** Medium

### Task 5.2: Simplify `app.ts` (772 lines)

**Description:** Main Express app. Route mounting and middleware configuration. Extract into a route-loading utility.

**Acceptance criteria:**

- [ ] Route mounting extracted to `registerRoutes()` function
- [ ] Rate limiter configuration extracted to `configureRateLimiters()`
- [ ] App setup < 400 lines

**Dependencies:** Task 2.1
**Estimated scope:** Small

---

## Phase 6: Auth Middleware Simplification

### Task 6.1: Simplify `refreshToken.ts` (569 lines)

**Description:** JWT refresh logic. Likely contains Redis operations, token validation, rotation logic. Extract into focused functions.

**Acceptance criteria:**

- [ ] Refresh logic < 250 lines
- [ ] Redis operations extracted to a dedicated token store
- [ ] All auth tests pass

**Dependencies:** Task 2.1
**Estimated scope:** Medium

### Task 6.2: Simplify `authRoutes.ts` (508 lines)

**Description:** Authentication routes. Multiple endpoints (login, register, refresh, etc.) likely in one file.

**Acceptance criteria:**

- [ ] Each auth flow (login, register, refresh) in separate route handlers
- [ ] File < 250 lines
- [ ] Zod validation schemas extracted

**Dependencies:** Task 2.1
**Estimated scope:** Medium

---

## Phase 7: Large Test File Splitting

### Task 7.1: Split `backtest-store.test.ts` (1391 lines)

**Description:** Largest test file. Split into focused test files by store feature area.

**Acceptance criteria:**

- [ ] Tests organized into 3-4 focused files (< 400 lines each)
- [ ] Each file covers one coherent feature area
- [ ] All tests still pass

**Dependencies:** None
**Estimated scope:** Medium

### Task 7.2: Split `jwt-auth.test.ts` (1078 lines)

**Description:** Extensive JWT auth test. Split into files by scenario (valid token, expired, invalid, missing, admin, analyst).

**Acceptance criteria:**

- [ ] Tests organized into 3-4 focused files
- [ ] Shared fixtures extracted
- [ ] All tests pass

**Dependencies:** None
**Estimated scope:** Medium

---

## Phase 8: Code Quality Pass

### Task 8.1: Replace nested ternaries with readable conditionals

**Description:** Scan all TS/TSX files for nested ternary chains (>2 levels) and replace with if/else or lookup objects.

**Acceptance criteria:**

- [ ] Zero ternary chains deeper than 2 levels
- [ ] All tests pass
- [ ] No behavioral changes

**Dependencies:** None
**Estimated scope:** Small (automated pass)

### Task 8.2: Extract duplicated conditional logic

**Description:** Find repeated `if` blocks (3+ lines) appearing in multiple places and extract to named predicate functions.

**Acceptance criteria:**

- [ ] No duplicated >3-line conditional blocks (allow exceptions for trivial checks)
- [ ] All tests pass

**Dependencies:** None
**Estimated scope:** Small (automated pass)

### Task 8.3: Remove dead code

**Description:** Identify unused variables, unreachable branches, commented-out code blocks, unused imports.

**Acceptance criteria:**

- [ ] ESLint `no-unused-vars` clean
- [ ] No `// TODO`/`// FIXME`/`// HACK` comments
- [ ] No commented-out code blocks
- [ ] All tests pass

**Dependencies:** None
**Estimated scope:** Small (automated pass)

### Task 8.4: Simplify generic names

**Description:** Rename `data`, `result`, `temp`, `val`, `item` to descriptive names where the content is unambiguous from context.

**Acceptance criteria:**

- [ ] Generic names replaced with descriptive names
- [ ] ESLint + TypeScript type check pass
- [ ] All tests pass

**Dependencies:** None
**Estimated scope:** Small

---

## Risks and Mitigations

| Risk                                       | Impact | Mitigation                                                          |
| ------------------------------------------ | ------ | ------------------------------------------------------------------- |
| Duplicate elimination breaks build tooling | High   | Verify `vite.config.ts`, `tsconfig.*`, `package.json` scripts first |
| Mega page split loses i18n context         | Medium | Extract i18n keys alongside components                              |
| Go engine changes break TS↔Go consistency  | High   | Run `tests/consistency/` after each change                          |
| Test splitting breaks shared fixtures      | Medium | Extract shared fixtures to `tests/helpers/`                         |
| Large file (>500 lines) touches >500 lines | Medium | Use AST tools (jscodeshift) for mechanical changes                  |

## Checkpoints

### After Phase 1-2 (Duplicate Elimination):

- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all ~180 tests)
- [ ] `npm run dev` starts both services
- [ ] E2E Playwright tests pass

### After Phase 3-4 (Mega Component/Go):

- [ ] All frontend tests pass
- [ ] Go engine tests pass (`go test ./...`)
- [ ] Consistency tests pass

### After Phase 5-6 (Auth/TS Engine):

- [ ] Full test suite passes
- [ ] Auth integration tests pass
- [ ] No new lint warnings

### After Phase 7-8 (Tests + Quality):

- [ ] All tests pass
- [ ] ESLint clean
- [ ] `npm run check` (tsc --noEmit) clean
- [ ] No new circular dependencies
