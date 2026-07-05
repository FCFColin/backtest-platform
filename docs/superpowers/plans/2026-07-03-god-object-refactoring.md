# God Object Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate God Objects across 5 categories (God Files, God Functions, God Folders, duplicated logic, dependency hubs) in a gradual, phased approach.

**Architecture:** Split monolithic React pages into focused component files; split oversized Go functions into domain sub-packages; deduplicate statistics computation across Go and TS; decouple dependency hubs. Each phase produces independently testable, shippable improvements.

**Tech Stack:** React 18 + TypeScript (frontend), Express + TypeScript (backend), Go 1.26 (engine), Vitest (TS tests), Go test (Go tests)

## Global Constraints

- TypeScript: ESM (`import`/`export`, `.js` extensions in relative imports)
- No commented-out code. No TODO/FIXME/HACK.
- Exported functions need JSDoc (`@param`, `@returns`, `@throws`)
- Go: follow existing patterns (`internal/` structure, camelCase JSON, existing error handling style)
- Each Phase must pass existing tests before and after changes
- Prefer extracting inline components to new files over rewriting logic

---

## File Structure Changes

### Phase 1 — God Pages Split + Go engine sub-package

```
packages/frontend/src/
├── components/
│   └── monteCarlo/
│       ├── types.ts              NEW - MonteCarloPage types (PortfolioMode, ResultTab, DistMetric, etc.)
│       ├── utils.ts              NEW - Pure data functions (percentile, mean, buildSummaryData, etc.)
│       ├── McPortfolioEditor.tsx  NEW - MonteCarlo-specific portfolio editor
│       ├── McParamsPanel.tsx      NEW - Params panel components (PortfolioModeToggle, SimParamsSection, etc.)
│       ├── McResultsPanel.tsx     NEW - Result display components (SummaryTab, RangeChart, etc.)
│       └── McPresets.tsx         NEW - Preset builder + SEO card + PresetsCard
│   └── analysis/
│       ├── types.ts              NEW - AnalysisPage types
│       ├── utils.ts              NEW - Analysis pure functions (calcCagr, calcVolatility, etc.)
│       ├── AnalysisParamsPanel.tsx NEW - Analysis parameter panel
│       └── AnalysisCharts.tsx     NEW - All chart components (RollingMetricsChart, RiskReturnChart, etc.)
├── hooks/
│   ├── useMonteCarloState.ts     NEW - useMonteCarloState + usePortfolioOperations + executeSimulation
│   └── useAnalysisState.ts      NEW - Analysis state management
├── pages/
│   ├── MonteCarloPage.tsx        MODIFY - slim down to ~80 lines (import + main component only)
│   └── AnalysisPage.tsx          MODIFY - slim down to ~80 lines
│
engine-go/internal/
├── backtest/                     NEW package - RunBacktest orchestrator + computeGrowthCurve
│   ├── growth.go                 NEW - computeGrowthCurve (extracted from engine/backtest.go)
│   ├── runner.go                 NEW - RunBacktest orchestrator (extracted from engine/backtest.go)
│   └── backtest_test.go          NEW - Tests for backtest package
├── engine/
│   ├── backtest.go               MODIFY - REMOVE computeGrowthCurve, RunBacktest; keep helpers
│   ├── statistics.go             KEEP - pure calc functions (unchanged)
│   ├── statistics_builder.go     NEW - computeStatistics extracted from backtest.go
│   ├── drawdown.go               KEEP - unchanged
│   ├── rebalance.go              KEEP - unchanged
│   └── types.go                  KEEP - unchanged (shared types)
├── server/
│   └── router.go                 MODIFY - import backtest package, call backtest.RunBacktest
```

### Phase 2 — More Page Splits + jwtAuth.ts

```
packages/frontend/src/
├── pages/
│   ├── EfficientFrontierPage.tsx  MODIFY - slim down
│   ├── TacticalPage.tsx          MODIFY - slim down
│   └── OptimizerPage.tsx         MODIFY - slim down
├── components/
│   ├── efficientFrontier/        NEW
│   ├── tactical/                 NEW
│   └── optimizer/                NEW
├── hooks/
│   └── useOptimizerState.ts     NEW (extracted from OptimizerPage.tsx)

packages/backend/src/middleware/
├── jwtAuth.ts                    MODIFY - factor out to sub-modules
├── jwtSigner.ts                  NEW - token generation
├── jwKVerifier.ts               NEW - token verification
├── refreshToken.ts               NEW - refresh token management
```

### Phase 3 — Dedup + portfolio.ts/dataService.ts

```
packages/backend/src/engine/
├── portfolio.ts                  MODIFY - split into sub-modules
├── growthCurve.ts                NEW
├── statistics.ts                 NEW (now the canonical TS version)
├── tickerAnalysis.ts             NEW
├── rebalance.ts                  NEW

packages/backend/src/services/
├── dataService.ts                MODIFY - split into sub-modules
├── dataQueryService.ts           NEW
├── dataIngestService.ts          NEW

engine-go/internal/engine/
├── statistics_builder.go         MODIFY - align with TS statistics.ts
```

### Phase 4 — Dependency Hub + Directory Reorg

```
packages/backend/src/
├── app.ts                        MODIFY - extract registrations
├── middleware/
│   └── setup.ts                  NEW - middleware registration
├── routes/
│   └── register.ts              NEW - route registration

packages/frontend/src/pages/
├── backtest/                     NEW subgroup
│   ├── MonteCarloPage.tsx        MOVE
│   ├── BacktestPage.tsx          MOVE
│   ├── BacktestOptimizerPage.tsx MOVE
│   └── RebalancingSensitivityPage.tsx MOVE
├── analysis/
│   ├── AnalysisPage.tsx          MOVE
│   ├── EfficientFrontierPage.tsx MOVE
│   ├── FactorRegressionPage.tsx  MOVE
│   └── PCAPage.tsx              MOVE
└── account/
    ├── AccountPage.tsx           MOVE
    ├── BillingPage.tsx           MOVE
    └── OrgMembersPage.tsx        MOVE
```

---

## Task Breakdown

### Phase 1: God Pages Split + Go engine sub-package

#### Task 1.1: Create MonteCarlo types file

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/types.ts`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx:1-38`

- [ ] **Step 1: Create types.ts with all MonteCarloPage types**

Copy these type definitions from `MonteCarloPage.tsx`:

```typescript
/** @file MonteCarlo shared types */

export type PortfolioMode = 1 | 2;
export type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
export type DistMetric =
  'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
export type SimMode = 'standard' | 'frontier';

export interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

export interface SimExecParams {
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  isComplete: (pIdx: number) => boolean;
  numYears: number;
  numSimulations: number;
  minBlock: number;
  maxBlock: number;
  withReplacement: boolean;
  randomSeed: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  simMode: SimMode;
  goal1: string;
  goal2: string;
  goalWeight: number;
}
```

- [ ] **Step 2: Remove these types from MonteCarloPage.tsx** (lines 30-38, remove `PortfolioMode`, `ResultTab`, `DistMetric`, `SimMode`, `PortfolioState` declarations)

- [ ] **Step 3: Verify nothing breaks** (`npm run check`)

#### Task 1.2: Create MonteCarlo utility functions

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/utils.ts`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx` (remove utility functions)

- [ ] **Step 1: Create utils.ts**

Copy all pure data functions from MonteCarloPage.tsx:

```typescript
import type { MonteCarloResult, PerPathMetrics } from '@backtest/shared/types';
import type { DistMetric, PortfolioState, PortfolioMode } from './types.js';

export function percentile(arr: number[], p: number): number { ... }
export function mean(arr: number[]): number { ... }
export function std(arr: number[]): number { ... }
export function fmtDollar(v: number): string { ... }
export function fmtPct(v: number, decimals = 1): string { ... }
export function fmtNum(v: number, decimals = 2): string { ... }
export const METRIC_LABELS: Record<DistMetric, string> = { ... }
export const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = { ... }
export function buildSummaryData(r: MonteCarloResult, startingValue: number) { ... }
export function buildRangeData(r: MonteCarloResult, startingValue: number): RangeDataPoint[] { ... }
export function buildSuccessData(r: MonteCarloResult) { ... }
export function buildDistHistogram(metrics: PerPathMetrics[], metric: DistMetric, startingValue: number) { ... }
export function buildScenarioData(r: MonteCarloResult, startingValue: number) { ... }
```

Include `RangeDataPoint` interface.

- [ ] **Step 2: Remove these functions from MonteCarloPage.tsx** (lines 67-279)

- [ ] **Step 3: Run `npm run check` to verify**

#### Task 1.3: Extract MonteCarlo portfolio editor

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/McPortfolioEditor.tsx`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx`

- [ ] **Step 1: Create McPortfolioEditor.tsx**

```typescript
/** @file MonteCarlo-specific portfolio editor */
import { X, Plus } from 'lucide-react';
import type { PortfolioState } from './types.js';

export function PortfolioEditor({
  portfolio: p,
  onUpdate,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  totalWeight,
  isComplete,
}: {
  portfolio: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
  onAddAsset: () => void;
  onRemoveAsset: (aIdx: number) => void;
  onUpdateAsset: (aIdx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isComplete: boolean;
}) {
  // ... copy lines 716-796 from MonteCarloPage.tsx
}
```

- [ ] **Step 2: Replace inline PortfolioEditor in MonteCarloPage.tsx with import**

```typescript
import { PortfolioEditor } from '../components/monteCarlo/McPortfolioEditor.js';
```

Remove lines 716-796.

- [ ] **Step 3: Run `npm run check` and `npm run lint`**

#### Task 1.4: Extract MonteCarlo state management hook

**Files:**

- Create: `packages/frontend/src/hooks/useMonteCarloState.ts`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx`

- [ ] **Step 1: Create useMonteCarloState.ts**

```typescript
/** @file MonteCarlo state management hook */
import { useState, Dispatch, SetStateAction } from 'react';
import type { MonteCarloResult } from '@backtest/shared/types';
import type {
  PortfolioState,
  PortfolioMode,
  ResultTab,
  DistMetric,
  SimMode,
  SimExecParams,
} from '../components/monteCarlo/types.js';
import { validatePortfolios } from '../components/monteCarlo/utils.js';

export function usePortfolioOperations(
  portfolios: PortfolioState[],
  setPortfolios: Dispatch<SetStateAction<PortfolioState[]>>,
) {
  // copy lines 920-948
}

export function useMonteCarloState() {
  // copy lines 1069-1161
}

export async function executeSimulation(
  params: SimExecParams,
  setters: {
    setError: (e: string | null) => void;
    setIsLoading: (b: boolean) => void;
    setResults1: (r: MonteCarloResult | null) => void;
    setResults2: (r: MonteCarloResult | null) => void;
  },
): Promise<void> {
  // copy lines 1006-1067
}
```

Also include `validatePortfolios` and `fetchMcResult` functions.

- [ ] **Step 2: Move createDefaultPortfolio and GOAL_OPTIONS to types.ts or utils.ts**

- [ ] **Step 3: Replace in MonteCarloPage.tsx**

```typescript
import { useMonteCarloState, usePortfolioOperations } from '../hooks/useMonteCarloState.js';
```

Remove lines 920-1161.

- [ ] **Step 4: Run all MonteCarlo-related tests**

Run: `npx vitest run tests/unit/ --reporter=verbose 2>&1 | Select-String "monte"`

#### Task 1.5: Extract MonteCarlo params panel components

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/McParamsPanel.tsx`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx`

- [ ] **Step 1: Create McParamsPanel.tsx**

Extract these components from MonteCarloPage.tsx:

- `PortfolioModeToggle` (lines 1167-1203)
- `PortfolioConfigSection` (lines 1205-1234)
- `SimParamsSection` (lines 1236-1337)
- `BuildModeSection` (lines 1339-1382)
- `GoalSelector` (lines 1384-1405)
- `DualGoalSection` (lines 1407-1437)
- `McParamsPanel` (lines 1439-1463)

```typescript
import { Play, Loader2 } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel.js';
import { PortfolioEditor } from './McPortfolioEditor.js';
import type { McState } from '../../hooks/useMonteCarloState.js';

// Export all components listed above
```

- [ ] **Step 2: Replace in MonteCarloPage.tsx**

Replace lines 1165-1463 with:

```typescript
export { McParamsPanel } from '../components/monteCarlo/McParamsPanel.js';
```

- [ ] **Step 3: Run `npm run check`**

#### Task 1.6: Extract MonteCarlo results display components

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/McResultsPanel.tsx`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx`

- [ ] **Step 1: Create McResultsPanel.tsx**

Extract from MonteCarloPage.tsx (lines 310-678, 800-916, 1548-1628):

- `SummaryTab` + `RangeChart` + `RangeTab` + `SuccessTab`
- `DistMetricSelector` + `DistHistogramChart` + `DistributionsTab`
- `ScenariosTab` + `TabContent`
- `StatCard` + `StatsGrid` + `ResultTabBar` + `ResultsDisplay`
- `MonteCarloResultsPanel`

Plus chart config constants (lines 282-306):

- `RANGE_AREAS`, `RANGE_LINES`, `TOOLTIP_STYLE`, etc.

```typescript
import { AreaChart, Area, XAxis, YAxis, ... } from 'recharts';
import { CHART_COLORS } from '@backtest/shared/types';
import type { MonteCarloResult } from '@backtest/shared/types';
import type { ResultTab, DistMetric } from './types.js';
// ... component implementations
```

- [ ] **Step 2: Replace in MonteCarloPage.tsx** — remove lines 310-678, 800-916, 1548-1628

- [ ] **Step 3: Run `npm run check`**

#### Task 1.7: Extract MonteCarlo presets and SEO card

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/McPresets.tsx`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx`

- [ ] **Step 1: Create McPresets.tsx**

Extract from MonteCarloPage.tsx (lines 1467-1683):

- `buildPresets` function
- `PresetButton` component
- `MonteCarloSeoCard` component
- `PresetsCard` component

- [ ] **Step 2: Slim MonteCarloPage.tsx to ~80 lines**

After all extracts, the page should be:

```typescript
export default function MonteCarloPage() {
  const s = useMonteCarloState();
  const presets = buildPresets(s);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">蒙特卡洛模拟</h1>
      </div>
      <MonteCarloSeoCard />
      <PresetsCard presets={presets} />
      <ToolPageLayout
        title="参数设置"
        params={<McParamsPanel s={s} />}
        results={<MonteCarloResultsPanel ... />}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm run check
npm run test:unit
```

#### Task 1.8: Split AnalysisPage.tsx — extract types + utils

**Files:**

- Create: `packages/frontend/src/components/analysis/types.ts`
- Create: `packages/frontend/src/components/analysis/utils.ts`
- Modify: `packages/frontend/src/pages/AnalysisPage.tsx`

- [ ] **Step 1: Create analysis/types.ts**

Extract type definitions from AnalysisPage.tsx.

- [ ] **Step 2: Create analysis/utils.ts**

Extract pure functions:

- `calcCagr`, `calcVolatility`, `calcSkewness`, `calcKurtosis`
- Formatter functions, constants

- [ ] **Step 3: Replace in AnalysisPage.tsx** — remove ~80 lines of type/function definitions

#### Task 1.9: Split AnalysisPage.tsx — extract chart components

**Files:**

- Create: `packages/frontend/src/components/analysis/AnalysisParamsPanel.tsx`
- Create: `packages/frontend/src/components/analysis/AnalysisCharts.tsx`
- Modify: `packages/frontend/src/pages/AnalysisPage.tsx`

- [ ] **Step 1: Create AnalysisParamsPanel.tsx** with parameter panel components

- [ ] **Step 2: Create AnalysisCharts.tsx** with all chart components:
  - `RollingMetricsChart` (102 lines)
  - `RiskReturnChart` (90 lines)
  - Other chart components

- [ ] **Step 3: Slim AnalysisPage.tsx** — keep only the main page component as orchestrator

- [ ] **Step 4: Run `npm run check`**

#### Task 1.10: Go engine — extract growth package

**Files:**

- Create: `engine-go/internal/backtest/runner.go`
- Create: `engine-go/internal/backtest/growth.go`
- Create: `engine-go/internal/backtest/backtest_test.go`
- Modify: `engine-go/internal/engine/backtest.go` (remove RunBacktest, computeGrowthCurve)
- Modify: `engine-go/internal/server/router.go` (update import)

- [ ] **Step 1: Create `engine-go/internal/backtest/growth.go`**

```go
package backtest

import (
    "fmt"
    "math"
    "time"

    "engine-go/internal/engine"
)

// computeGrowthCurve calculates the portfolio growth curve.
func computeGrowthCurve(
    pf engine.PortfolioInput,
    priceData engine.PriceDataMap,
    cpiData map[string]float64,
    exchangeRates map[string]float64,
    tradingDates []time.Time,
    params engine.BacktestParams,
) ([]engine.DataPoint, []engine.AllocationPoint, error) {
    // copy lines 115-384 from engine/backtest.go
}
```

- [ ] **Step 2: Create `engine-go/internal/backtest/runner.go`**

```go
package backtest

import (
    "fmt"
    "sort"

    "engine-go/internal/engine"
)

// RunBacktest executes a full backtest.
func RunBacktest(req engine.BacktestRequest) (*engine.BacktestResult, error) {
    // copy lines 20-103 from engine/backtest.go
    // replace computeGrowthCurve(...) with backtest.computeGrowthCurve(...)
    // Note: this is the same package, so just call computeGrowthCurve(...) directly
}
```

- [ ] **Step 3: Modify `engine-go/internal/engine/backtest.go`**

Remove `RunBacktest` (lines 20-103) and `computeGrowthCurve` (lines 106-384).
Keep: `sumFloat`, `buildPeriodicCashflowMap`, `findCPIForDate`, `computeBenchmarkGrowth`,
`computeRollingReturns`, `computeStatistics`, `computeCorrelationMatrix`,
`annualReturnsFromCurve`, `monthlyReturnsFromCurve`, `parseTradingDates`,
`filterByDateRange`, `collectAssetTickers`, `getPrice`, `extractPrices`,
`dailyReturnsFromPrices`, `dailyReturns`, `extractValues`, `extractDates`.

Wait — `computeStatistics` should stay in `engine/backtest.go` since it's called by `RunBacktest` but also uses `engine.CalcCAGR` etc. Actually, since `backtest` package imports `engine`, `computeStatistics` can either:

- Stay in `engine` package (called by `backtest.RunBacktest` via `engine.computeStatistics`)
- Move to `engine/statistics_builder.go`

Let's move it to `engine/statistics_builder.go` for clarity, and have `backtest.RunBacktest` call `engine.ComputeStatistics` (exported).

- [ ] **Step 4: Move computeStatistics to engine/statistics_builder.go (exported)**

Create `engine-go/internal/engine/statistics_builder.go`:

```go
package engine

// ComputeStatistics computes all statistics from curve and benchmark data.
func ComputeStatistics(curve []DataPoint, ddCurve []DrawdownPoint, episodes []DrawdownEpisode, benchCurve []DataPoint) Statistics {
    // copy lines 645-797 from engine/backtest.go
}
```

Rename `computeStatistics` to `ComputeStatistics` (exported).

- [ ] **Step 5: Update `engine-go/internal/server/router.go`**

```go
import (
    "engine-go/internal/backtest"
)

// handleBacktest:
result, err := backtest.RunBacktest(req)
```

- [ ] **Step 6: Run Go tests**

```bash
cd engine-go
go build ./...
go test ./internal/backtest/...
go test ./internal/engine/...
```

- [ ] **Step 7: Create `engine-go/internal/backtest/backtest_test.go`**

Copy relevant tests from `engine-go/internal/engine/backtest_test.go`.

### Phase 2 — More Page Splits + jwtAuth.ts

#### Task 2.1: Split remaining large pages

**Files:**

- Modify: `packages/frontend/src/pages/EfficientFrontierPage.tsx` (1,282 → ~200 lines)
- Modify: `packages/frontend/src/pages/TacticalPage.tsx` (1,163 → ~200 lines)
- Modify: `packages/frontend/src/pages/OptimizerPage.tsx` (1,041 → ~200 lines)
- Modify: `packages/frontend/src/pages/CalculatorsPage.tsx` (940 → ~200 lines)
- Modify: `packages/frontend/src/pages/RebalancingSensitivityPage.tsx` (927 → ~200 lines)
- Modify: `packages/frontend/src/pages/DataEnginePage.tsx` (912 → ~200 lines)
- Modify: `packages/frontend/src/pages/BacktestOptimizerPage.tsx` (905 → ~200 lines)
- Modify: `packages/frontend/src/pages/LumpSumVsDCAPage.tsx` (847 → ~200 lines)
- Modify: `packages/frontend/src/pages/GoalOptimizerPage.tsx` (779 → ~200 lines)
- Create: `packages/frontend/src/components/efficientFrontier/*` — extracted components
- Create: `packages/frontend/src/components/tactical/*` — extracted components
- Create: `packages/frontend/src/components/optimizer/*` — extracted components
- Create: `packages/frontend/src/components/calculators/*` — extracted components

Follow same pattern as Task 1.1-1.9:

- Extract types to `components/X/types.ts`
- Extract utils to `components/X/utils.ts`
- Extract chart components to `components/X/*.tsx`
- Extract state hooks to `hooks/useXState.ts`

#### Task 2.2: Split jwtAuth.ts

**Files:**

- Create: `packages/backend/src/middleware/jwtSigner.ts`
- Create: `packages/backend/src/middleware/jwtVerifier.ts`
- Create: `packages/backend/src/middleware/refreshToken.ts`
- Modify: `packages/backend/src/middleware/jwtAuth.ts` (keep as facade)

- [ ] **Step 1: Extract jwtSigner.ts**

Token signing/generation logic (JWT creation, key management):

- `generateKeyPairIfNeeded()`
- `signAccessToken()`
- `signRefreshToken()`
- Key loading functions (`loadPrivateKey`, `loadPublicKey`, etc.)

- [ ] **Step 2: Extract jwKVerifier.ts**

Token verification logic:

- `verifyAccessToken()`
- `handleBearerTokenAuth()`
- `resolveJwk()`

- [ ] **Step 3: Extract refreshToken.ts**

Refresh token management:

- `refreshAccessTokenRedis()`
- `refreshAccessTokenMemory()`
- Redis interaction for token storage

- [ ] **Step 4: Turn jwtAuth.ts into facade**

```typescript
export { signAccessToken, signRefreshToken } from './jwtSigner.js';
export { verifyAccessToken, handleBearerTokenAuth } from './jwtVerifier.js';
export { refreshAccessTokenRedis, refreshAccessTokenMemory } from './refreshToken.js';
```

- [ ] **Step 5: Run tests and npm run check**

### Phase 3 — Dedup + portfolio.ts/dataService.ts

#### Task 3.1: Deduplicate statistics computation

- [ ] **Step 1: Audit Go statistics duplication**

Compare `engine.RunAnalysis` (analysis.go) vs `engine.ComputeStatistics` (statistics_builder.go). The analysis.go computes statistics manually inline instead of calling `ComputeStatistics`. Fix: refactor `RunAnalysis` to use `ComputeStatistics`.

- [ ] **Step 2: Audit TS statistics duplication**

Compare `packages/backend/src/engine/portfolio.ts:buildStatisticsObject` with the Go version. Determine if these should remain separate (Go is primary, TS is fallback) or if we should extract a shared constants file.

- [ ] **Step 3: Extract shared financial constants**

Create `packages/shared/constants.ts` entries for: `tradingDaysPerYear`, `riskFreeRate`, etc. (already partially exists).

#### Task 3.2: Split portfolio.ts

**Files:**

- Create: `packages/backend/src/engine/growthCurve.ts`
- Create: `packages/backend/src/engine/statistics.ts`
- Create: `packages/backend/src/engine/portfolio.ts` (slimmed)

#### Task 3.3: Split dataService.ts

**Files:**

- Create: `packages/backend/src/services/dataQueryService.ts`
- Create: `packages/backend/src/services/dataIngestService.ts`
- Create: `packages/backend/src/services/dataCacheService.ts`
- Modify: `packages/backend/src/services/dataService.ts` (keep as facade)

### Phase 4 — Dependency Hub + Directory Reorg

#### Task 4.1: Decouple app.ts

**Files:**

- Create: `packages/backend/src/middleware/setup.ts`
- Create: `packages/backend/src/routes/register.ts`
- Modify: `packages/backend/src/app.ts`

#### Task 4.2: Decouple backtestRoutes.ts

**Files:**

- Modify: `packages/backend/src/routes/backtestRoutes.ts`
- (Sink business logic to services/)

#### Task 4.3: Reorganize pages directory

**Files:**

- Move pages into subdirectories:
  `pages/backtest/`, `pages/analysis/`, `pages/account/`, `pages/admin/`

---

## Verification Strategy

| Phase   | Verification                                                                          |
| ------- | ------------------------------------------------------------------------------------- |
| Phase 1 | `npm run check` + `npm run test:unit` + `cd engine-go && go test ./...`               |
| Phase 2 | `npm run check` + `npm run test:unit` + targeted page tests                           |
| Phase 3 | `npm run check` + `npm run test:unit` + `cd engine-go && go test ./internal/analysis` |
| Phase 4 | `npm run check` + `npm run test:unit` + `npm run lint`                                |

Each task within a phase must pass `npm run check` before the next task begins.
