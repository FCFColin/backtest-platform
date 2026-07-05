# Task 1: 代码质量与风格自检报告

## TypeScript 类型检查

- **状态: FAIL**
- 错误数: 6
- 错误均位于 `packages/frontend/src/pages/BacktestOptimizerPage.tsx`:
  - TS6133: `BacktestOptimizerParams` 声明但未使用 (line 1)
  - TS6133: `BacktestOptimizerResults` 声明但未使用 (line 2)
  - TS6133: `useBacktestOptimizerState` 声明但未使用 (line 4)
  - TS2304: 找不到名称 `useOptimizerState` (line 36)
  - TS2304: 找不到名称 `OptimizerParams` (line 45)
  - TS2304: 找不到名称 `OptimizerResults` (line 46)
- 原因: 该文件导入了不存在的符号（疑似重命名/重构后导入未更新），导致前端 tsc 检查失败

## ESLint 检查

- **状态: FAIL**
- 错误数: 2322, 警告数: 33
- eslint-disable 压制: 7 条

### eslint-disable 规则明细

| 规则                                 | 数量 |
| ------------------------------------ | ---- |
| `@typescript-eslint/no-explicit-any` | 4    |
| `react-hooks/exhaustive-deps`        | 3    |

### 错误分布（主要）

| 错误规则                               | 描述                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `no-useless-escape`                    | 不必要的转义字符（`\"\.\"`），占绝大多数错误（2289+条） |
| `max-lines-per-function`               | 函数超 80 行（33 条警告）                               |
| `react-refresh/only-export-components` | 1 条警告                                                |

### 警告分布（max-lines-per-function 超标文件）

| 文件                                                       | 函数                         | 行数 |
| ---------------------------------------------------------- | ---------------------------- | ---- |
| `rebalancingSensitivity/RebalancingSensitivityParams.tsx`  | RebalancingSensitivityParams | 168  |
| `analysis/AnalysisParamsPanel.tsx`                         | AnalysisParamsPanel          | 128  |
| `optimizer/OptimizerParams.tsx`                            | BasicParams                  | 115  |
| `charts/CorrelationMatrix.tsx`                             | RollingCorrelationSection    | 106  |
| `analysis/AnalysisCharts.tsx`                              | RollingMetricsChart          | 101  |
| `monteCarlo/params/McParamsPanel.tsx`                      | SimParamsSection             | 102  |
| `efficientFrontier/useEfficientFrontierState.ts`           | useEfficientFrontierState    | 108  |
| `analysis/AnalysisCharts.tsx`                              | StatsTable                   | 94   |
| `analysis/AnalysisCharts.tsx`                              | RiskReturnChart              | 89   |
| `analysis/AnalysisCharts.tsx`                              | MonthlyHeatmap               | 86   |
| `analysis/AnalysisCharts.tsx`                              | TelltaleChart                | 84   |
| `optimizer/OptimizerResults.tsx`                           | WeightBarChart               | 85   |
| `optimizer/OptimizerResults.tsx`                           | FrontierChart                | 82   |
| `rebalancingSensitivity/RebalancingSensitivityResults.tsx` | ResultsTable                 | 97   |
| `rebalancingSensitivity/RebalancingSensitivityResults.tsx` | OffsetTab                    | 81   |
| `monteCarlo/results/McResultsPanel.tsx`                    | MonteCarloResultsPanel       | 81   |
| `monteCarlo/useMonteCarloState.ts`                         | useMonteCarloState           | 91   |

## Prettier 格式检查

- **状态: FAIL**
- 不一致文件数: 195
- 涵盖: packages/frontend/src, packages/backend/src, tests/, scripts/, 配置文件等

## Knip 死代码检测

### 未使用文件: 15

- `postcss.config.js`
- `tailwind.config.js`
- `scripts/check-api-coverage.mjs`
- `scripts/i18n-fix.mjs`
- `scripts/i18n-replace.mjs`
- `scripts/parse-eslint.mjs`
- `scripts/load/load-stages.js`
- `scripts/load/measure-baseline.mjs`
- `scripts/load/smoke.js`
- `tests/benchmark/statistics.bench.ts`
- `packages/frontend/src/hooks/useCalculatorsState.ts`
- `packages/frontend/src/store/index.ts`
- `packages/backend/src/application/cqrs.ts`
- `packages/backend/src/schemas/pagination.ts`
- `packages/backend/src/types/pg-copy-streams.d.ts`

### 未使用导出: 80

关键未使用导出（部分）：

| 导出                                         | 文件                                                  |
| -------------------------------------------- | ----------------------------------------------------- |
| `hashPassword`                               | `backend/src/services/userService.ts`                 |
| `hasPermission`                              | `backend/src/middleware/rbac.ts`                      |
| `getRolePermissions`                         | `backend/src/middleware/rbac.ts`                      |
| `executeOptimization`                        | `backend/src/routes/backtestOptimizerRoutes.ts`       |
| `executeGridSearch`                          | `backend/src/routes/tacticalGridRoutes.ts`            |
| `refreshEngineStatusFromDb`                  | `backend/src/services/engineService.ts`               |
| `sdk`                                        | `backend/src/tracing.ts`                              |
| `DomainEventDispatcher`                      | `backend/src/domain/events/index.ts`                  |
| `getOrCachePrivateKey`                       | `backend/src/middleware/jwtSigner.ts`                 |
| `sendMail`                                   | `backend/src/services/mailService.ts`                 |
| `GrowthChart` 等 11 个组件                   | `frontend/src/components/analysis/AnalysisCharts.tsx` |
| `calcCagr`, `calcVolatility` 等 8 个工具函数 | `frontend/src/components/analysis/utils.ts`           |

### 未使用类型: 87

关键未使用类型（部分）：

| 类型                                    | 文件                                                      |
| --------------------------------------- | --------------------------------------------------------- |
| `BacktestHooks`                         | `backend/src/engine/portfolio.ts`                         |
| `BacktestExecutionParams/Result`        | `backend/src/application/backtest-service.ts`             |
| `TacticalBacktestRequest/Result`        | `backend/src/application/tactical-application-service.ts` |
| `PathMetrics`, `RebalanceParams`        | `backend/src/engine/goalOptimizer.ts`, `rebalance.ts`     |
| `DualSignalResult`, `MultiSignalResult` | `backend/src/engine/signal.ts`                            |
| `User`                                  | `backend/src/services/userService.ts`                     |
| `ProblemDetail`, `SendProblemOptions`   | `backend/src/utils/errors.ts`                             |
| `AnalysisTabKey`                        | `frontend/src/components/analysis/types.ts`               |
| 20+ schema request types                | `backend/src/schemas/*.ts`                                |

### 未使用依赖: 1

- `zod` — `packages/frontend/package.json`

### 未使用 devDependencies: 16

- `@eslint/js`, `@testing-library/react`, `@vitejs/plugin-react`, `autoprefixer`, `eslint`, `eslint-config-prettier`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-sonarjs`, `globals`, `postcss`, `tailwindcss`, `vite-plugin-istanbul`, `vite-plugin-trae-solo-badge`, `vite-tsconfig-paths` (frontend)
- `tsx` (backend)

### 未声明依赖（使用但未在 package.json 声明）: 51

主要包括: `happy-dom`, `vite`, `@vitejs/plugin-react`, `@backtest/shared` (test files), `pg` (test files), `express` (test helpers), `jose` (test files), `bullmq` (test files), `zod` (test files)

### 重复导出: 1

- `makeLinearPriceData` / `makePriceData` — `tests/helpers/fixtures.ts`

## 大文件审查 (>500 行)

| 文件                                                                              | 行数 |
| --------------------------------------------------------------------------------- | ---- |
| `packages/backend/src/engine/portfolio.ts`                                        | 1176 |
| `packages/frontend/src/components/analysis/AnalysisCharts.tsx`                    | 1064 |
| `packages/frontend/src/pages/DataEnginePage.tsx`                                  | 950  |
| `packages/frontend/src/components/PortfolioEditor.tsx`                            | 857  |
| `packages/frontend/src/pages/LumpSumVsDCAPage.tsx`                                | 847  |
| `packages/frontend/src/pages/TacticalGridPage.tsx`                                | 815  |
| `packages/backend/src/app.ts`                                                     | 808  |
| `packages/frontend/src/pages/GoalOptimizerPage.tsx`                               | 779  |
| `packages/backend/src/services/dataService.ts`                                    | 755  |
| `packages/backend/src/engine/optimizer.ts`                                        | 745  |
| `packages/frontend/src/pages/FactorRegressionPage.tsx`                            | 735  |
| `packages/frontend/src/components/calculators/CalculatorsParams.tsx`              | 710  |
| `packages/frontend/src/components/monteCarlo/results/McResultsPanel.tsx`          | 651  |
| `packages/backend/src/middleware/refreshToken.ts`                                 | 637  |
| `packages/frontend/src/components/ParameterPanel.tsx`                             | 624  |
| `packages/frontend/src/components/efficientFrontier/EfficientFrontierResults.tsx` | 601  |
| `packages/frontend/src/pages/MultiSignalPage.tsx`                                 | 589  |
| `packages/backend/src/routes/authRoutes.ts`                                       | 588  |
| `packages/frontend/src/store/backtestStore.ts`                                    | 578  |
| `packages/frontend/src/pages/BacktestPage.tsx`                                    | 572  |
| `packages/frontend/src/pages/LETFSlippagePage.tsx`                                | 563  |
| `packages/frontend/src/pages/DualSignalPage.tsx`                                  | 542  |
| `packages/frontend/src/pages/OrgMembersPage.tsx`                                  | 532  |
| `packages/frontend/src/pages/PCAPage.tsx`                                         | 529  |
| `packages/backend/src/engine/statistics.ts`                                       | 509  |
| `packages/frontend/src/components/charts/CorrelationMatrix.tsx`                   | 506  |
| `packages/backend/src/routes/backtestRoutes.ts`                                   | 503  |

## TypeScript 编译器严格性

| 选项                               | 当前值 | 推荐值    |
| ---------------------------------- | ------ | --------- |
| `strict`                           | `true` | `true` ✅ |
| `noUnusedLocals`                   | `true` | `true` ✅ |
| `noUnusedParameters`               | `true` | `true` ✅ |
| `noFallthroughCasesInSwitch`       | `true` | `true` ✅ |
| `forceConsistentCasingInFileNames` | `true` | `true` ✅ |
| `noUncheckedSideEffectImports`     | `true` | `true` ✅ |

**说明**: 所有严格性选项均已正确启用。tsconfig.base.json 为根配置，frontend/backend 均继承。

## ESLint 复杂度规则

| 规则                           | 阈值                                    | 配置位置                        |
| ------------------------------ | --------------------------------------- | ------------------------------- |
| `complexity`                   | 15 (warn)                               | packages/{backend,frontend}/src |
| `max-depth`                    | 4 (warn)                                | packages/{backend,frontend}/src |
| `max-lines-per-function`       | 80 (warn, skipBlankLines, skipComments) | packages/{backend,frontend}/src |
| `max-params`                   | 5 (warn)                                | packages/{backend,frontend}/src |
| `max-nested-callbacks`         | 3 (warn)                                | packages/{backend,frontend}/src |
| `sonarjs/cognitive-complexity` | 15 (warn)                               | packages/{backend,frontend}/src |

## 整体评估

| 检查项              | 状态     | 说明                                                                            |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| TypeScript 类型检查 | **FAIL** | 6 个错误（1 个文件），`BacktestOptimizerPage.tsx` 导入缺失符号                  |
| ESLint 检查         | **FAIL** | 2322 errors + 33 warnings；大量 `no-useless-escape`（regex 转义）+ 超长函数警告 |
| Prettier 格式检查   | **FAIL** | 195 个文件格式不一致                                                            |
| Knip 死代码检测     | **FAIL** | 15 未使用文件 + 80 未使用导出 + 87 未使用类型 + 17 未使用/未声明依赖            |
| 大文件审查          | **WARN** | 27 个文件 >500 行（最大 1176 行），需拆分                                       |
| TypeScript 严格性   | **PASS** | 所有严格选项已启用                                                              |
| ESLint 复杂度规则   | **PASS** | 阈值配置合理（15/4/80/5/3/15）                                                  |

**总结**: TypeScript 严格性和 ESLint 复杂度规则配置到位，但执行层面有严重技术债。核心问题: (1) `no-useless-escape` 占 ESLint 错误主体（regex 中不必要的反斜杠转义），批量修复可消除 2000+ 错误; (2) 195 个文件未格式化; (3) `BacktestOptimizerPage.tsx` 编译失败需立即修复; (4) 27 个大文件超过 500 行; (5) 167 个未使用导出/类型可清理。
