### Task 1.1: Create MonteCarlo types file

**Files:**

- Create: `packages/frontend/src/components/monteCarlo/types.ts`
- Modify: `packages/frontend/src/pages/MonteCarloPage.tsx:1-38`

**Interfaces:**

- Consumes: Existing types in MonteCarloPage.tsx (lines 30-56)
- Produces: Exported types file used by all subsequent MonteCarlo tasks

- [ ] **Step 1: Create types.ts with all MonteCarloPage type definitions**

Create `packages/frontend/src/components/monteCarlo/types.ts`:

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

export interface RangeDataPoint {
  month: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}
```

- [ ] **Step 2: Remove these type declarations from MonteCarloPage.tsx**

Remove lines 30-38 (the type aliases `PortfolioMode`, `ResultTab`, `DistMetric`, `SimMode`, `PortfolioState`).
Remove `RangeDataPoint` interface (line ~183-191).
Remove `SimExecParams` interface (lines ~987-1004).

Also remove the `createDefaultPortfolio` function (lines 41-56) and `GOAL_OPTIONS` constant (lines 58-65) — move them to types.ts.

- [ ] **Step 3: Verify nothing breaks**

Run: `npm run check`
