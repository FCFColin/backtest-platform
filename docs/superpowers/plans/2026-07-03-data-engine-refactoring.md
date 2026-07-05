# DataEnginePage Refactoring Plan

## Goal

Split DataEnginePage.tsx (950 lines) into modular components following the project pattern.

## Tasks

### Task 1: Create types.ts

Create `components/dataEngine/types.ts` with:

- Stats interface
- UniverseStats interface
- Constants (MAX_POLL, INITIAL_TIMEOUT_MS)
- TFunc type

### Task 2: Create utils.ts

Create `components/dataEngine/utils.ts` with:

- fmt function
- pct function
- formatStorageMb function
- historySpanYears function
- getLoadStage function
- classifyError function
- handlePollSuccess function
- createPoll function
- doFetchStats function
- doActionFn function

### Task 3: Create DataEngineDashboard.tsx

Create `components/dataEngine/DataEngineDashboard.tsx` with:

- DataEngineLoading component
- DataEngineActions component
- DataEngineOverviewCards component
- DataEngineCoverageBars component
- MarketDistributionCard component
- ExchangeDistributionCard component
- DecadeDistributionCard component
- YearCountDistributionCard component
- SampleTickersCard component
- RecentUpdatesCard component
- DataQualityCard component
- UniverseInfo component
- StatCard component
- ProgressBar component
- QualityItem component

### Task 4: Create DataEnginePresets.tsx

Create `components/dataEngine/DataEnginePresets.tsx` with:

- No SEO card exists in the original file, so this will be empty or minimal

### Task 5: Slim DataEnginePage.tsx

Modify `DataEnginePage.tsx` to import from the new files and reduce to ~80-100 lines.

## Global Constraints

- Use ESM imports with .js extensions
- Keep all CSS/styles/logic
- No added comments
- Remove unused imports
- Run `npm run check` after completion
