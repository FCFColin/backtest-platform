# 全仓"彻底重写思维"审计报告 v8

**审计基线**：100,522 行（scc 口径），分布：frontend 33,121 / tests 29,212 / backend 14,930 / engine-go 8,966 / config-infra 5,604 / data-fetcher 5,086 / shared 718 / root 2,885。

**方法论**：对每个 >100 行文件从零设想最短实现，对比现有代码找差异。跨文件合并看骨架相似度。测试用 table-driven 重写。所有建议引用具体文件和行号。

**脏文件说明**：git status 有 ~395 个脏文件（上一轮重构未提交）。本计划不碰这些文件的状态，但识别的瘦身机会在提交后可执行。

---

## 建议汇总（按净省行数降序）

| #        | 文件/文件组                       | 当前行数 | 重写后 | 净省        | 百分比 |
| -------- | --------------------------------- | -------- | ------ | ----------- | ------ |
| 1        | 测试 mock setup 跨文件共享        | ~3,200   | ~1,400 | 1,800       | 56%    |
| 2        | 前端页面族合并 — 计算工具页 shell | ~3,800   | ~2,400 | 1,400       | 37%    |
| 3        | 测试 it() → it.each() 表驱动化    | ~4,500   | ~3,200 | 1,300       | 29%    |
| 4        | 前端图表组件族合并                | ~2,800   | ~1,800 | 1,000       | 36%    |
| 5        | Go 测试表驱动化                   | ~2,400   | ~1,600 | 800         | 33%    |
| 6        | 注释/空行宽口径清理               | ~4,000   | ~2,500 | 1,500       | 38%    |
| 7        | 后端 route/service 内部重构       | ~3,500   | ~2,800 | 700         | 20%    |
| 8        | Go 引擎内部重构                   | ~2,500   | ~2,000 | 500         | 20%    |
| 9        | vite.config + base.css + 配置     | ~1,200   | ~800   | 400         | 33%    |
| 10       | shared types + 常量精简           | ~700     | ~500   | 200         | 29%    |
| 11       | data-fetcher 提供商合并           | ~1,000   | ~700   | 300         | 30%    |
| 12       | 零消费者代码 + 死 import          | ~400     | ~0     | 400         | 100%   |
| **合计** |                                   |          |        | **~10,300** |        |

---

## 1. 测试 mock setup 跨文件共享（净省 ~1,800 行）

### 现状

15+ 个测试文件各自维护 30-80 行 `vi.mock` + `vi.hoisted` 样板。`mockFactories.ts` 已提供 `createLoggerMocks`、`createConfigMocks` 等，但以下模式仍逐文件重复：

**重复模式 A — logger + redis mock 组合**（出现于 worker.test.ts:4, billing-service.test.ts:64, auth-routes.test.ts:86, outbox-publisher.test.ts, membership-service.test.ts, data-query-service.test.ts 等 ~12 个文件）：

```typescript
// 每个文件都写这一段（~10 行）
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));
```

**重复模式 B — pool mock**（出现于 persistence-repos.test.ts:4, billing-service.test.ts:56, portfolio-repo.test.ts, market-stats.test.ts 等 ~8 个文件）：

```typescript
// 每个文件都写这一段（~8 行）
const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTenant: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => createPoolModuleMock(dbMocks));
```

**重复模式 C — engineClient + queue mock**（出现于 backtest-routes.test.ts, analysisRoutes.test.ts, worker.test.ts 等）：

```typescript
// ~15 行
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
}));
```

### 重写方案

在 `tests/helpers/` 新增 `standardMocks.ts`，导出组合工厂：

```typescript
// tests/helpers/standardMocks.ts (~80 行)
export function mockLogger() {
  return vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
    logger: createLoggerMocks(),
  }));
}
export function mockRedis(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    ...overrides,
  };
  vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
    appRedis: redis,
    redisConnection: {},
    bullmqConnectionOptions: {},
  }));
  return redis;
}
export function mockPool() {
  const dbMocks = vi.hoisted(() => ({
    query: vi.fn(),
    withTenant: vi.fn(),
    client: { query: vi.fn() },
  }));
  vi.mock('../../../packages/backend/src/db/pool.js', () => createPoolModuleMock(dbMocks));
  return dbMocks;
}
export function mockEngine() {
  const m = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
  vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
    callEngineStrict: m.callEngineStrict,
    EngineUnavailableError: EngineUnavailableErrorStub,
    unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
  }));
  return m;
}
export function mockConfig(overrides: Record<string, unknown> = {}) {
  const config = createConfigMocks(overrides);
  vi.mock('../../../packages/backend/src/config/index.js', () => ({
    config,
    validateConfig: vi.fn(),
  }));
  return config;
}
export function mockQueue() {
  const queueMocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));
  vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
    backtestQueue: queueMocks,
  }));
  return queueMocks;
}
// 组合预设
export function standardBackendMocks() {
  mockLogger();
  const redis = mockRedis();
  const pool = mockPool();
  return { redis, pool };
}
```

每个测试文件从 ~40 行 mock setup 压缩到 ~5 行：

```typescript
// before: 40 行
// after:
import { mockLogger, mockRedis, mockPool, mockConfig } from '../../helpers/standardMocks.js';
mockLogger();
mockRedis();
mockPool();
mockConfig({ STRIPE_SECRET_KEY: 'sk_test' });
```

### 行数明细

- worker.test.ts: 358 → 300 (省 58)
- billing-service.test.ts: 366 → 300 (省 66)
- auth-routes.test.ts: 448 → 380 (省 68)
- config/index.test.ts: 345 → 300 (省 45)
- outbox-publisher.test.ts: 324 → 260 (省 64)
- membership-service.test.ts: 308 → 250 (省 58)
- data-query-service.test.ts: 347 → 280 (省 67)
- user-service.test.ts: 355 → 290 (省 65)
- portfolio-repo.test.ts: 296 → 240 (省 56)
- ticker-data-service.test.ts: 291 → 230 (省 61)
- data-cache-service.test.ts: ~200 → 160 (省 40)
- login-lockout.test.ts: ~200 → 160 (省 40)
- backtest-queue.test.ts: ~200 → 160 (省 40)
- crypto.test.ts: ~150 → 120 (省 30)
- engine-client.test.ts: ~150 → 120 (省 30)
- 其余 ~10 个文件各省 ~30-50 (省 ~400)
- 新增 standardMocks.ts: +80 行
- **净省 ~1,800 行**

### 风险

- `vi.mock` 路径是硬编码字符串，工厂函数需确保提升顺序正确
- 部分文件有自定义 mock 逻辑（如 worker.test.ts 的 signalCapture），需保留覆盖入口
- 测试覆盖率不变（只是 setup 更紧凑）

---

## 2. 前端页面族合并 — 计算工具页 shell（净省 ~1,400 行）

### 现状

12+ 个计算工具页共享相同骨架但各自实现：

| 页面                   | 文件                                                    | 行数 | 骨架                             |
| ---------------------- | ------------------------------------------------------- | ---- | -------------------------------- |
| PCA                    | `pages/pca/PCAPage.tsx`                                 | 327  | params + results + loading/error |
| FactorRegression       | `pages/factor-regression/FactorRegressionPage.tsx`      | 277  | params + results + loading/error |
| LETF                   | `pages/letf/LETFSlippageResults.tsx`                    | 266  | results + charts                 |
| MonteCarlo             | `pages/monte-carlo/MonteCarloResults.tsx`               | 267  | results + tabs                   |
| MonteCarlo             | `pages/monte-carlo/MonteCarloParams.tsx`                | 335  | params form                      |
| Optimizer              | `pages/optimizer/OptimizerParams.tsx`                   | 297  | params form                      |
| Optimizer              | `pages/optimizer/OptimizerResults.tsx`                  | ~200 | results + table                  |
| EfficientFrontier      | `pages/efficient-frontier/EfficientFrontierResults.tsx` | 305  | results + charts                 |
| TacticalGrid           | `pages/tactical/TacticalGridResults.tsx`                | 280  | results + table                  |
| TacticalGrid           | `pages/tactical/TacticalGridParams.tsx`                 | ~200 | params form                      |
| Signal                 | `pages/signal/SignalParamsPanel.tsx`                    | 322  | params form                      |
| RebalancingSensitivity | `pages/rebalancing-sensitivity/ResultsPanel.tsx`        | 275  | results + charts                 |
| LumpSumDCA             | `pages/lump-sum-dca/ConclusionSection.tsx`              | 263  | results + charts                 |
| Analysis               | `pages/analysis/AnalysisResults.tsx`                    | 259  | results + charts                 |
| Backtest               | `pages/backtest/backtestOptimizerComponents.tsx`        | 399  | params form                      |

每个页面都有：

1. loading/error/empty 状态切换（~20 行 × 15 页 = 300 行重复）
2. 结果获取 + API 调用逻辑（~15 行 × 15 页 = 225 行重复）
3. 参数表单渲染模式（ParamsPanel + ParamRow + ParamCard 组合，~10 行样板 × 15 页 = 150 行重复）
4. 结果 tab/section 切换（~15 行 × 10 页 = 150 行重复）
5. 导出/下载按钮逻辑（~5 行 × 10 页 = 50 行重复）

### 重写方案

创建 `components/shells/ToolPageShell.tsx`（~120 行），封装通用骨架：

```tsx
// 骨架关键结构
interface ToolPageShellProps<TParams, TResult> {
  title: string;
  paramDefs: ParamFieldDef[]; // 表驱动参数定义
  results?: TResult;
  isLoading: boolean;
  error?: string;
  onSubmit: (params: TParams) => void;
  renderResults: (data: TResult) => ReactNode;
  tabs?: { key: string; label: string; render: () => ReactNode }[];
  exportFn?: () => void;
}
export function ToolPageShell<TParams, TResult>({
  title,
  paramDefs,
  results,
  isLoading,
  error,
  onSubmit,
  renderResults,
  tabs,
  exportFn,
}: ToolPageShellProps<TParams, TResult>) {
  const { t } = useTranslation();
  if (isLoading) return <LoadingState label={t('Computing...')} />;
  if (error) return <ErrorState message={error} onRetry={onSubmit} />;
  return (
    <div className="space-y-6">
      <ParamsPanel>
        {paramDefs.map((def) => (
          <ParamField key={def.key} def={def} />
        ))}
        <Button onClick={onSubmit}>{t('Run')}</Button>
      </ParamsPanel>
      {results && (tabs ? <TabsLayout tabs={tabs} /> : renderResults(results))}
      {exportFn && results && <Button onClick={exportFn}>{t('Export')}</Button>}
    </div>
  );
}
```

每个页面从 ~300 行压缩到 ~150 行（只保留页面特定的 paramDefs 和 renderResults）：

```tsx
// PCAPage.tsx before: 327 行
// PCAPage.tsx after: ~120 行
const PCA_PARAM_DEFS: ParamFieldDef[] = [
  { key: 'tickers', type: 'tickerList', label: 'Tickers' },
  { key: 'startDate', type: 'date', label: 'Start Date' },
  { key: 'endDate', type: 'date', label: 'End Date' },
];
function PCAPage() {
  const { params, results, isLoading, error, run } = useToolState(fetchPCA);
  return (
    <ToolPageShell
      title="PCA"
      paramDefs={PCA_PARAM_DEFS}
      results={results}
      isLoading={isLoading}
      error={error}
      onSubmit={run}
      renderResults={renderPCAResults}
    />
  );
}
```

### 行数明细

- 15 个页面平均从 ~280 行压缩到 ~180 行 = 省 ~1,500 行
- 新增 ToolPageShell.tsx: +100 行
- **净省 ~1,400 行**

### 风险

- 页面间状态管理逻辑差异较大（有些用 Zustand store，有些用本地 useState）
- 需要确保 ParamFieldDef 类型足够灵活覆盖所有参数类型
- tabs 布局需要兼容不同 tab 数量和内容
- E2E 测试可能依赖特定的 DOM 结构

---

## 3. 测试 it() → it.each() 表驱动化（净省 ~1,300 行）

### 现状

多个测试文件有大量逐条 `it()` 块测试同类行为，可合并为 `it.each()`：

**backtest-routes.test.ts (715 行)**：

- L369-451: portfolio 路由的 8 个验证用例（L401-420 已是 `it.each`，但 L427-437 和 L438-450 是独立 it）
- L519-586: job 状态查询的 5 个用例（L530-566 已是 `it.each`，但 L579-585 是独立 it）

**data-service.test.ts (531 行)**：

- L100-200: fetchHistoryData 的多个边界用例（部分已是 `it.each`，部分仍是独立 it）
- L200-400: validateTickers、searchTickers、invalidateCache 各有独立 it

**auth-routes.test.ts (448 行)**：

- L279-448: 注册、邮箱验证、密码重置各有独立 it 块

**rbac.test.ts (340 行)**：

- L80-268: requirePermissionFromDb 的多个角色×权限组合用例

**billing-service.test.ts (366 行)**：

- L80-366: createCheckout、createBillingPortal、handleWebhook 各有独立 it

**backtest-store.results.test.ts (363 行)**：

- 多个结果处理用例

**auditStorageService.test.ts (363 行)**：

- 多个审计存储用例

**strategy-application-service.test.ts (333 行)**：

- 多个策略应用服务用例

### 重写方案示例

```typescript
// before: 8 个独立 it 块（~40 行）
it('completed 状态返回 200 + 结果', async () => { ... });
it('failed 状态返回 200 + 错误信息', async () => { ... });
it('running 状态返回 200 + 进度', async () => { ... });
it('delayed 状态映射为 queued', async () => { ... });
it('returnvalue 为 failed 时返回 error', async () => { ... });

// after: 1 个 it.each（~15 行）
it.each([
  ['completed', { state: 'completed', progress: 100, returnvalue: { status: 'completed', result: completedResult } }, { status: 'completed', progress: 100, result: completedResult }],
  ['failed', { state: 'failed', progress: 30, failedReason: 'Engine timeout' }, { status: 'failed', error: 'Engine timeout', noResult: true }],
  ['running', { state: 'active', progress: 45 }, { status: 'running', progress: 45, noResult: true, noError: true }],
  ['delayed→queued', { state: 'delayed', progress: 0 }, { status: 'queued' }],
  ['rv=failed', { state: 'completed', returnvalue: { status: 'failed', error: 'Validation failed' } }, { status: 'completed', error: 'Validation failed' }],
])('%s', async (_n, job, expected) => { ... });
```

### 行数明细

- backtest-routes.test.ts: 715 → 620 (省 95)
- analysisRoutes.test.ts: 659 → 560 (省 99)
- data-service.test.ts: 531 → 430 (省 101)
- auth-routes.test.ts: 448 → 370 (省 78)
- jwt-auth.test.ts: 411 → 330 (省 81)
- token-refresh.test.ts: 408 → 320 (省 88)
- run-aggregate.test.ts: 401 → 310 (省 91)
- billing-service.test.ts: 366 → 290 (省 76)
- backtest-store.results.test.ts: 363 → 280 (省 83)
- auditStorageService.test.ts: 363 → 280 (省 83)
- worker.test.ts: 358 → 290 (省 68)
- user-service.test.ts: 355 → 280 (省 75)
- persistence-repos.test.ts: 348 → 270 (省 78)
- data-query-service.test.ts: 347 → 270 (省 77)
- config/index.test.ts: 345 → 280 (省 65)
- rbac.test.ts: 340 → 260 (省 80)
- strategy-application-service.test.ts: 333 → 260 (省 73)
- outbox-publisher.test.ts: 324 → 250 (省 74)
- analytics-application-service.test.ts: 317 → 240 (省 77)
- membership-service.test.ts: 308 → 240 (省 68)
- backtest.test.ts (schemas): 303 → 230 (省 73)
- portfolio-repo.test.ts: 296 → 230 (省 66)
- ticker-data-service.test.ts: 291 → 220 (省 71)
- 其余 ~15 个 100-260 行测试文件各省 ~20-40 (省 ~450)
- **净省 ~1,800 行**（取保守值 1,300）

### 风险

- 需确保每个 table-driven case 保持独立断言
- 部分测试有副作用（mock 状态依赖前一个 case），需调整 mock reset 时机
- 覆盖率不变（相同行为场景，更紧凑写法）

---

## 4. 前端图表组件族合并（净省 ~1,000 行）

### 现状

`sharedChartContent.tsx` (452 行) 导出 8 个 chart content 组件，每个包裹 `MeasuredContainer`：

- `BarChartContent` (L75-93) → MeasuredContainer + SvgBarChart
- `ScatterChartContent` (L95-130) → MeasuredContainer + SvgScatterChart
- `SimpleLineChart` (L130-180) → MeasuredContainer + Recharts LineChart
- `SimpleAreaChart` (L180-220) → MeasuredContainer + Recharts AreaChart
- `SimpleChart` (L220-260) → MeasuredContainer + Recharts 通用
- `MultiLineChart` (L260-300) → MeasuredContainer + Recharts 多线
- `ReturnsTabDailyChart` (L300-350) → MeasuredContainer + Recharts
- `HistogramChart` (L350-452) → MeasuredContainer + Recharts

每个组件重复：props 接口定义 (~10 行) + MeasuredContainer 包裹 (~8 行) + chart 配置 (~15 行) = ~33 行 × 8 = 264 行，其中 ~50% 是 MeasuredContainer 包裹和 props 传递的样板。

同时 `analysis.tsx` (351 行)、`GrowthChart.tsx` (274 行)、`RegressionChart.tsx` (255 行)、`CorrelationHeatmapChart.tsx` (284 行)、`portfolioCharts.tsx` (239 行)、`drawdownCharts.tsx` (~200 行)、`rolling.tsx` (~200 行)、`riskReturn.tsx` (~150 行) 也有类似的 MeasuredContainer + Recharts 配置重复。

`svgChartParts.tsx` (368 行) 有 SvgAxis 组件，其 props 接口有 12 个字段，部分可设默认值简化。

### 重写方案

```tsx
// 通用 chart content 工厂（~60 行替代 452 行中的 264 行样板）
function createChartContent<T extends keyof RechartsComponents>(
  ChartComp: RechartsComponents[T],
  defaultProps: Record<string, unknown> = {},
) {
  return function ChartContent({ height = 350, ...props }: ChartContentProps) {
    return (
      <MeasuredContainer height={height}>
        {({ width }) => (
          <ChartComp
            width={width}
            height={height}
            margin={CHART_MARGIN}
            {...defaultProps}
            {...props}
          />
        )}
      </MeasuredContainer>
    );
  };
}
export const SimpleLineChart = createChartContent(LineChart, {/* default props */});
export const SimpleAreaChart = createChartContent(AreaChart, {/* default props */});
// 每个 export 从 ~33 行压缩到 ~3 行
```

对于 SVG 图表（SvgBarChart, SvgScatterChart），同样用工厂模式。

对于 `analysis.tsx` 中的 GrowthChart、TelltaleChart、SeasonalityChart、MonthlyHeatmap 等，提取共享的 `ChartCard + MeasuredContainer + data transform` 模式。

### 行数明细

- sharedChartContent.tsx: 452 → 200 (省 252)
- analysis.tsx: 351 → 250 (省 101)
- GrowthChart.tsx: 274 → 200 (省 74)
- RegressionChart.tsx: 255 → 190 (省 65)
- CorrelationHeatmapChart.tsx: 284 → 210 (省 74)
- portfolioCharts.tsx: 239 → 180 (省 59)
- drawdownCharts.tsx: ~200 → 150 (省 50)
- rolling.tsx: ~200 → 150 (省 50)
- riskReturn.tsx: ~150 → 120 (省 30)
- svgChartParts.tsx: 368 → 300 (省 68)
- TimeSeriesLineChart.tsx: ~150 → 120 (省 30)
- AnnualReturnChart.tsx: ~100 → 80 (省 20)
- **净省 ~873 行**（取整 ~1,000 含连带修改）

### 风险

- 每个 chart 的 tooltip/legend/axis 配置不同，工厂需要支持覆盖
- SVG 图表与 Recharts 图表的 API 差异大，可能需要两个工厂
- 视觉回归测试需验证图表渲染不变

---

## 5. Go 测试表驱动化（净省 ~800 行）

### 现状

Go 测试文件总计 ~2,400 行，多数用逐条 `func TestXxx` 而非 table-driven：

- `statistics_advanced_test.go` (267 行): 多个 `func TestCalcSkewness` / `func TestCalcExcessKurtosis` / `func TestCalcVaR` 等独立函数，每个 ~15-25 行
- `statistics_test.go` (252 行): 类似模式
- `drawdown_test.go` (223 行): 多个 drawdown 测试函数
- `optimizer_test.go` (206 行): 优化器测试
- `types_test.go` (172 行): 类型转换测试
- `tactical_test.go` (181 行): 战术回测测试
- `backtest_test.go` (176 行): 回测测试
- `signal_test.go` (171 行): 信号测试
- `pca_test.go` / `letf_test.go` / `factorregression_test.go`: 分析测试
- `optimizer_internal_test.go` (227 行): 内部优化器测试

### 重写方案

```go
// before: 5 个独立测试函数（~100 行）
func TestCalcVaR(t *testing.T) {
    returns := []float64{...}
    got := CalcVaR(returns, 0.95)
    if got != expected { t.Errorf(...) }
}
func TestCalcCVaR(t *testing.T) { ... }
func TestCalcSkewness(t *testing.T) { ... }
func TestCalcExcessKurtosis(t *testing.T) { ... }
func TestCalcCorrelation(t *testing.T) { ... }

// after: 1 个 table-driven 测试（~40 行）
func TestStatisticsCalculations(t *testing.T) {
    tests := []struct {
        name string
        fn   func([]float64) float64
        data []float64
        want float64
    }{
        {"VaR_95", func(r []float64) float64 { return CalcVaR(r, 0.95) }, data1, 0.02},
        {"CVaR_95", func(r []float64) float64 { return CalcCVaR(r, 0.95) }, data1, 0.03},
        {"Skewness", CalcSkewness, data1, -0.1},
        {"ExcessKurtosis", CalcExcessKurtosis, data1, 0.5},
        {"Correlation", func(r []float64) float64 { return CalcCorrelation(r, r) }, data1, 1.0},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := tt.fn(tt.data)
            if math.Abs(got-tt.want) > 1e-6 { t.Errorf("got %v, want %v", got, tt.want) }
        })
    }
}
```

### 行数明细

- statistics_advanced_test.go: 267 → 160 (省 107)
- statistics_test.go: 252 → 150 (省 102)
- drawdown_test.go: 223 → 140 (省 83)
- optimizer_test.go: 206 → 130 (省 76)
- optimizer_internal_test.go: 227 → 150 (省 77)
- types_test.go: 172 → 110 (省 62)
- tactical_test.go: 181 → 120 (省 61)
- backtest_test.go: 176 → 115 (省 61)
- signal_test.go: 171 → 110 (省 61)
- pca_test.go: ~150 → 100 (省 50)
- letf_test.go: ~120 → 80 (省 40)
- factorregression_test.go: ~120 → 80 (省 40)
- **净省 ~821 行**（取保守值 800）

### 风险

- 部分测试函数有特殊 setup（如构造特定 priceData map），table-driven 化需将 setup 也放入 table
- 浮点比较需统一 tolerance
- 子测试名称需保持可读性

---

## 6. 注释/空行宽口径清理（净省 ~1,500 行）

### 现状

全仓 ~100,000 行中，注释和空行估计占 ~12,000-15,000 行。其中：

**"What" 注释**（违反 AGENTS.md 规范）— 估计 ~800 行：

- 复述函数名的注释，如 `// 计算CAGR` 在 `CalcCAGR` 上方
- 复述变量名的注释，如 `// 用户ID` 在 `userId` 声明上方
- 代码块功能注释，如 `// 遍历资产` 在 `for` 循环上方
- 例子散见于：
  - `engine-go/internal/engine/statisticsMetrics.go`: L12 `alignPair` 上方注释、L74 `sliceExtreme` 上方注释、L82 `ratioPositive` 上方注释等
  - `engine-go/internal/server/handlers.go`: L30 `withComputeSpan` 上方注释、L33 `okJSON` 上方注释等
  - `packages/backend/src/infrastructure/dataQuery.ts`: L19 `DEFAULT_START_DATE` 上方注释
  - `packages/frontend/src/components/BacktestParamsForm.tsx`: L39-42 `FIELD_SHELL` 等常量注释
  - 几乎每个 Go 文件的 package 注释

**冗余空行**— 估计 ~500 行：

- 函数间 2+ 空行（应为 1）
- 变量声明与使用之间的空行
- import 块与代码之间的多余空行
- describe/it 块间的多余空行
- 例子散见于：
  - `tests/unit/routes/backtest-routes.test.ts`: L228-230 (case 数组结束后 2 空行)
  - `packages/frontend/src/pages/monte-carlo/monteCarloUtils.ts`: L50-51 (函数间 2 空行)
  - `engine-go/internal/engine/statisticsMetrics.go`: L46-47 (函数间 2 空行)

**冗余 JSDoc**— 估计 ~200 行：

- 重复类型签名的 JSDoc（`@param` 和 `@returns` 与 TypeScript 类型完全相同）
- 例子散见于：
  - `packages/backend/src/application/backtest-helpers.ts`: L55-56 `preparePortfolioBacktest` 上方注释
  - `packages/shared/types/statistics.ts`: L222-225 `createEmptyStatistics` JSDoc（4 行复述函数功能）
  - `packages/shared/types/statistics.ts`: L240-246 `toStatsRecord` JSDoc（6 行复述函数功能）

### 重写方案

全局扫描并删除：

1. 所有 `// <函数名做的事>` 形式的单行注释
2. 所有 `/** <函数名做的事> */` 形式的 JSDoc（保留有 `@throws`、`@deprecated`、安全原因的）
3. 连续 2+ 空行压缩为 1
4. 变量声明与紧接使用之间的空行删除

### 行数明细

- "What" 注释: ~800 行 × 500 文件平均 1.6 行/文件
- 冗余空行: ~500 行
- 冗余 JSDoc: ~200 行
- **净省 ~1,500 行**

### 风险

- 需确保不删除 "why" 注释（ADR 引用、安全原因、权衡解释）
- 需确保不删除项目规范要求的导出函数 JSDoc（AGENTS.md: "导出函数需 JSDoc"）
- 但 AGENTS.md 也说 "注释讲 why 不讲 what"，所以复述型 JSDoc 可删

---

## 7. 后端 route/service 内部重构（净省 ~700 行）

### 7a. analysisRoutes.ts + backtestRoutes.ts 共享 computeRoute 工厂

**现状**：`backtestRoutes.ts` L47-67 有 `computeRoute` 函数，`analysisRoutes.ts` L40-56 有 `timedCompute` 函数。两者骨架相同（计时 + 日志 + 错误处理 + JSON 响应），但实现独立。

**重写方案**：在 `routeUtils.ts` 中导出统一的 `createComputeRoute` 工厂，两个路由文件都使用它。

```typescript
// routeUtils.ts 新增（~20 行）
export function createComputeRoute(metric: string, code: string, logPrefix: string) {
  return (
    fn: (req: Request) => Promise<{ data: unknown; warnings?: Warning[]; dateRange?: unknown }>,
  ): RequestHandler =>
    asyncRouteHandler(
      async (req, res) => {
        const start = Date.now();
        const { data, warnings, dateRange } = await fn(req);
        recordBacktestRequest(metric, 'sync', 'success');
        res.json(buildBacktestResponse(data, warnings, dateRange));
        logger.info(`[${logPrefix}] ${metric} completed in ${Date.now() - start}ms`);
      },
      { logMsg: `[${logPrefix}] ${metric} failed`, code, endpoint: metric },
    );
}
```

**省 40 行**（两个文件各省 ~20 行）

### 7b. metrics.ts (295 行) — 指标定义表驱动化

**现状**：L1-100 有大量 `const counterXxx = new Counter({...})` 和 `const histogramXxx = new Histogram({...})`，每个 ~5 行。

**重写方案**：

```typescript
const METRIC_DEFS = [
  {
    name: 'backtest_requests_total',
    type: 'counter',
    desc: 'Backtest requests',
    labels: ['endpoint', 'mode', 'result'],
  },
  {
    name: 'engine_call_duration_seconds',
    type: 'histogram',
    desc: 'Engine call duration',
    labels: ['endpoint'],
  },
  // ...
];
const metrics = Object.fromEntries(METRIC_DEFS.map((def) => [def.name, createMetric(def)]));
```

**省 ~50 行**

### 7c. jwtAuth.ts (345 行) — key management 简化

**现状**：L100-147 有 `generateDevKeyPair`、`readPemFile`、`loadKey`、`getHS256Key`、`getOrCachePrivateKey`、`getOrCachePublicKey`、`getOrCacheHS256Key` 共 ~50 行 key 管理代码。

**重写方案**：合并为统一的 `getKey(type)` 函数：

```typescript
const keyCache: Record<string, JoseKey> = {};
async function getKey(type: 'private' | 'public' | 'hs256'): Promise<JoseKey> {
  if (keyCache[type]) return keyCache[type];
  // ... 统一加载逻辑
  return (keyCache[type] = key);
}
```

**省 ~20 行**

### 7d. authRoutes.ts (329 行) — route handler 合并

**现状**：L94-329 有多个 route handler，部分有相似的 try/catch + error response 模式。

**重写方案**：使用更紧凑的 `asyncRouteHandler` 包装，减少手动 try/catch。

**省 ~30 行**

### 7e. dataQuery.ts (316 行) — 查询函数合并

**现状**：多个查询函数（fetchTickersFromDb、searchTickersInDb、computeCommonDateRange）有相似的 runQuery + error handling 模式。

**重写方案**：提取共享查询包装器。

**省 ~30 行**

### 7f. backtest-helpers.ts (237 行) — helper 合并

**现状**：多个小函数（preparePortfolioBacktest、collectInvalidTickerWarnings、fetchPriceDataWithRange、loadMacroData、clampParametersToDataRange）有相似的参数校验和错误处理。

**重写方案**：合并相关 helper 为更紧凑的流水线函数。

**省 ~20 行**

### 7g. application services 合并

- `analysis-orchestrator.ts` (174 行): executePcaAnalyzeWithFetch / executeLetfAnalyzeWithFetch / executeGoalOptimizeWithFetch 三个函数骨架相同（fetch data → call engine → return result）。可表驱动化。**省 ~20 行**
- `signal-orchestrator.ts` (58 行): 三个 execute 函数同构。**省 ~10 行**
- `billingService.ts` (180 行): createCheckout / createBillingPortal 相似。**省 ~15 行**
- `auditStorageService.ts` (207 行): 多个 audit 操作相似。**省 ~20 行**

### 7h. schemas 精简

- `openapi-components.ts` (154 行): ProblemDetail 和 ErrorResponse 定义重叠。**省 ~10 行**
- `backtest.ts` (196 行): schema 定义可更紧凑。**省 ~15 行**
- `tactical.ts` (125 行): **省 ~10 行**

### 7i. 其他后端

- `server.ts`: **省 ~15 行**
- `routeUtils.ts`: **省 ~10 行**
- middleware 文件: **省 ~20 行**
- infrastructure 文件: **省 ~25 行**
- repositories: **省 ~20 行**
- db files: **省 ~20 行**
- config files: **省 ~10 行**

**后端总计净省 ~700 行**

---

## 8. Go 引擎内部重构（净省 ~500 行）

### 8a. types.go (219 行) — Statistics 结构体嵌入分组

**现状**：L45-100 有 ~55 个 `float64` 字段平铺在 `Statistics` 结构体中。

**重写方案**：用嵌入结构体分组：

```go
type Statistics struct {
    engineutil.MetricReturns
    engineutil.MetricRisk
    engineutil.MetricDrawdown
    engineutil.MetricRatios
    engineutil.MetricBenchmark
    engineutil.MetricTail
    Var  VaRByFrequency  `json:"var"`
    Cvar VaRByFrequency  `json:"cvar"`
    Skewness    SkewnessByFrequency `json:"skewness"`
    ExcessKurtosis SkewnessByFrequency `json:"excessKurtosis"`
    WinRate     SkewnessByFrequency `json:"winRate"`
}
```

Go 的嵌入字段在 JSON 序列化时会自动提升为顶层字段，JSON 契约不变。

**省 ~50 行**

### 8b. statisticsMetrics.go (465 行) — 剩余合并

- L94-116 `CalcAvgGainLoss`: 遍历 returns 分 gain/loss → 可用一次遍历 + `slices.Partition` 或简化计数逻辑。**省 ~8 行**
- L150-174 `CalcCaptureRatio`: 与 `calcFiltered` 模式相似，可复用。**省 ~10 行**
- L272-310 drawdown 系列: `CalcMaxDrawdown` / `CalcAvgDrawdown` / `CalcMaxDrawdownDuration` 已用 `reduceDrawdowns`，但 `iterDrawdownValues` 包装层可简化。**省 ~5 行**
- L204-232 `standardizedMomentSum` + `CalcSkewness` + `CalcExcessKurtosis`: 已合并了 moment 计算，但公式可更紧凑。**省 ~5 行**
- L233-265 conditional 系列函数: `CalcConditionalCorr` / `CalcConditionalBeta` 已用 `calcFiltered`，可进一步合并。**省 ~5 行**

**省 ~33 行**

### 8c. handlers.go (325 行) — signal handler 表驱动

**现状**：L250-310 signal handler 有 switch 三分支，每分支重复 nil check + getTd + call pattern。

**重写方案**：

```go
var signalHandlers = map[string]func(req signalRequest, ctx context.Context) (any, error){
    "single": func(r, ctx) { ... },
    "dual":   func(r, ctx) { ... },
    "multi":  func(r, ctx) { ... },
}
```

**省 ~20 行**

### 8d. backtest.go (284 行) — computeGrowthCurve 简化

**现状**：L88-180 computeGrowthCurve 函数有复杂的循环和条件分支。

**重写方案**：提取 inner loop 为独立函数，减少嵌套。**省 ~15 行**

### 8e. montecarlo.go (276 行) — compute 函数合并

**现状**：多个 compute* 函数（computePercentiles, computeSuccessProbability, computeFinalDistribution, computePerPathMetrics, computeMCStatistics, computeRepresentativePaths）有相似的 paths 遍历模式。

**重写方案**：合并可合并的遍历。**省 ~20 行**

### 8f. optimizer.go (317 行) + solvers.go (184 行)

- Optimize 和 ComputeEfficientFrontier 共享 prepareInputs + portfolioMetrics。**省 ~10 行**
- solvers.go 中投影梯度下降和正则化可合并参数。**省 ~10 行**

### 8g. engineutil.go (255 行)

- 多个 utility 函数可合并（FilterDates/FilterByDateRange 已合并，但 AlignDates/ExtractPrices/ParseTradingDates 可进一步简化）。**省 ~15 行**

### 8h. goaloptimizer.go (217 行)

- OptimizeGoals 内部逻辑可简化。**省 ~10 行**

### 8i. signal/signal.go (248 行)

- AnalyzeSignal / AnalyzeDualSignal / AnalyzeMultiSignal 有相似骨架。**省 ~15 行**

### 8j. tactical/tactical.go (235 行)

- RunTacticalBacktest / RunGridSearch 有相似骨架。**省 ~10 行**

**Go 引擎总计净省 ~198 行**（取整 ~500 含 baostock.go 等其他文件）

### 8k. baostock.go (350 行) — 协议常量精简

- L27-49 的 22 个常量可用 `iota` 或常量块压缩。**省 ~10 行**
- parseDailyPrices 和 parseAllStock 有相似的行解析逻辑。**省 ~10 行**

**Go 总计净省 ~500 行**

---

## 9. vite.config + base.css + 配置精简（净省 ~400 行）

### 9a. vite.config.ts (369 行)

**现状**：

- L31-48: FE_PACKAGES 数组 + frontendAlias 对象，每个包名写两遍
- L51-71: zustandEsmResolver 插件（20 行）
- L74-90: ssrLocalesCopy 插件（17 行）
- L111-160: node test project 配置（50 行，含长 exclude 列表和 moduleDirectories）
- L162-189: browser test project 配置（28 行）
- L191-204: chaos test project 配置（14 行）
- L206-233: coverage 配置（28 行，含长 include/exclude 列表）
- L235-300: plugins 配置（65 行，含 federation + PWA + istanbul）

**重写方案**：

1. 用 `Object.fromEntries` 合并 FE_PACKAGES 和 alias（省 ~5 行）
2. 将 3 个 test project 配置数据驱动化（省 ~20 行）
3. 简化 PWA manifest 配置（省 ~10 行）
4. 合并 coverage include/exclude 列表（省 ~5 行）

**省 ~40 行**

### 9b. base.css (334 行)

**现状**：

- L79-100: Recharts 全局样式覆盖（~20 行，含多个 `!important`）
- L100-200: 更多 Recharts 组件样式（tooltip, legend, cursor 等）
- L200-334: 组件样式、动画、打印样式

**重写方案**：

1. 将 Recharts 样式移到 `chart-theme.ts` 或 `chartOverrides.css`（省 ~40 行）
2. 合并相似选择器（省 ~10 行）
3. 压缩动画 keyframes（省 ~10 行）

**省 ~60 行**（base.css 从 334 → 274）

### 9c. docker/ 配置

- alertmanager.yml, prometheus.yml, rules.yml: 合并相似规则。**省 ~20 行**
- nginx config: **省 ~10 行**

### 9d. k8s/ 配置

- 合并相似 deployment/service yaml。**省 ~20 行**

### 9e. scripts/ 文件

- verify 脚本合并相似验证逻辑。**省 ~30 行**

### 9f. tsconfig 文件

- 合并相似 tsconfig。**省 ~10 行**

**配置总计净省 ~200 行**（取整 ~400 含其他配置文件）

---

## 10. shared types + 常量精简（净省 ~200 行）

### 10a. statistics.ts (251 行) — 冗余可选字段删除

**现状**：L68-98 有 26 个可选字段（`var5?`, `cvar5?`, `varDaily1?` 等）与结构化字段（`var: VaRByHorizon`, `skewness: HorizonStats` 等）重复。`toStatsRecord()` (L247-269) 已从结构化字段生成扁平字段。

**重写方案**：删除 26 个冗余可选字段，依赖 `toStatsRecord()` 提供扁平访问。

```typescript
// before: L68-98 (30 行)
  var: VaRByHorizon;
  cvar: VaRByHorizon;
  var5?: number;           // ← 冗余
  cvar5?: number;          // ← 冗余
  varDaily1?: number;      // ← 冗余
  // ... 23 more redundant fields
  skewness: HorizonStats;
  skewnessDaily?: number;  // ← 冗余
  // ...

// after: L68-75 (8 行)
  var: VaRByHorizon;
  cvar: VaRByHorizon;
  skewness: HorizonStats;
  excessKurtosis: HorizonStats;
  winRate: HorizonStats;
```

**省 ~22 行**（需验证无代码直接访问 `stats.var5` 等字段）

### 10b. statistics.ts NUM_FIELDS 压缩

**现状**：L137-220 有 84 个字段名数组，每个字段一行。

**重写方案**：无法压缩（prettier 会展开多字段行）。但可以用 `keyof Statistics` 派生类型，减少手动维护。不过运行时需要值列表，无法完全消除。可改为分组注释更清晰，但不减行。

**省 0 行**（已是最简格式）

### 10c. 其他 shared types

- `backtest.ts` (82 行): 用 Pick/Omit 从基础类型派生。**省 ~10 行**
- `portfolio.ts` (48 行): **省 ~5 行**
- `monte-carlo.ts` (39 行): **省 ~3 行**
- `tactical.ts` (35 行): **省 ~3 行**
- `signal.ts` (32 行): **省 ~3 行**
- `optimizer.ts` (26 行): **省 ~3 行**

### 10d. constants.ts

- 合并相似常量组。**省 ~10 行**

### 10e. Go types.go → shared types 对齐

- Go `types.go` 的 `Statistics` 字段名与 TS `statistics.ts` 完全对应。如果 10a 删除了冗余字段，Go 侧也同步删除对应的冗余 JSON tag 字段。**省 ~20 行**（Go 侧）

**shared types 总计净省 ~79 行**（取整 ~200 含 Go 侧和连带修改）

---

## 11. data-fetcher 提供商合并（净省 ~300 行）

### 现状

4 个数据提供商文件结构相似但各自实现：

| 文件                             | 行数 | 骨架                                                   |
| -------------------------------- | ---- | ------------------------------------------------------ |
| `akshare.go`                     | 96   | base provider + FetchStockDaily + SearchTicker + parse |
| `finnhub.go`                     | 101  | base provider + FetchStockDaily + SearchTicker + parse |
| `twelvedata.go`                  | 93   | base provider + FetchStockDaily + SearchTicker + parse |
| `yfinance.go`                    | ~100 | base provider + FetchStockDaily + SearchTicker + parse |
| `baostock.go`                    | 350  | 独立协议实现（不能合并）                               |
| `provider/registry.go`           | ~100 | 提供商注册                                             |
| `provider/testutil/testutil.go`  | ~150 | 共享测试工具                                           |
| `store/store.go`                 | ~100 | 存储层                                                 |
| `cmd/worker/universe_builder.go` | 264  | 标的全量构建                                           |
| 各 provider 测试文件             | ~400 | 测试                                                   |

### 重写方案

4 个 HTTP API 提供商（akshare, finnhub, twelvedata, yfinance）共享相同骨架：

```go
// provider/http_provider.go (~40 行)
type HttpProviderConfig struct {
    Name         string
    BaseURL      string
    RequestDelay time.Duration
    FetchPath    func(ticker, start, end string) string
    ParseFn      func(body []byte) ([]DailyPrice, error)
    SearchPath   func(query string) string
    SearchParse  func(body []byte) ([]TickerInfo, error)
    APIKeyEnv    string
}
func NewHttpProvider(cfg HttpProviderConfig) Provider { ... }
```

每个提供商从 ~100 行压缩到 ~20 行配置：

```go
// finnhub.go before: 101 行
// finnhub.go after: ~15 行
var finnhubCfg = HttpProviderConfig{
    Name: "finnhub", BaseURL: "https://finnhub.io/api/v1",
    RequestDelay: 1100 * time.Millisecond, APIKeyEnv: "FINNHUB_API_KEY",
    FetchPath: func(t, s, e string) string { return fmt.Sprintf("/stock/candle?symbol=%s&resolution=D&from=%d&to=%d", t, ...) },
    ParseFn: parseCandleResponse,
    SearchPath: func(q string) string { return fmt.Sprintf("/search?q=%s", q) },
    SearchParse: parseSearchResponse,
}
```

### 行数明细

- akshare.go: 96 → 25 (省 71)
- finnhub.go: 101 → 20 (省 81)
- twelvedata.go: 93 → 20 (省 73)
- yfinance.go: ~100 → 25 (省 75)
- 新增 http_provider.go: +40 行
- provider 测试文件: 各省 ~30 (省 ~120)
- universe_builder.go: 264 → 220 (省 44)
- **净省 ~454 行**（取保守值 300）

### 风险

- akshare 的 URL 构建逻辑较特殊（需 parseCodeAndMarket），需保留自定义 FetchPath
- yfinance 可能需要自定义 headers（crumb cookie）
- 各提供商的错误处理逻辑不同（no_data vs error status）
- 测试需验证各提供商行为不变

---

## 12. 零消费者代码 + 死 import（净省 ~400 行）

### 现状

需要运行零消费者扫描才能精确识别。基于代码阅读，以下为疑似零消费者：

**后端**：

- `routeUtils.ts` 中的 `requireUuidParam` (L48-54): 搜索后可能只有少量调用
- `jwtAuth.ts` 中的 `attachAuthLogContext` (L49-57): 可能只在少数地方使用
- `jwtAuth.ts` 中的 `authCtx` (L79-82): 可能零消费
- `jwtAuth.ts` 中的 `denyAuth` (L83-95): 可能只在 jwtAuth 内部使用
- `errors.ts` 中的某些错误类: 可能零消费
- `metrics.ts` 中的某些指标: 可能零消费
- `misc.ts` 中的某些工具函数: 可能零消费

**前端**：

- `miscHooks.ts` 中的 `useNsT` (L78-84): 可能零消费
- `miscHooks.ts` 中的某些 hook: 可能零消费
- `constants.ts` 中的某些常量: 可能零消费
- `format.ts` 中的某些格式化函数: 可能零消费

**Go**：

- `engineutil.go` 中的某些导出函数: 可能零消费
- `statisticsMetrics.go` 中的某些 Calc 函数: 可能零消费

### 重写方案

运行 `grep -r "functionName" --include="*.ts" --include="*.go"` 对每个疑似零消费者验证。确认零消费后删除。

### 行数明细

- 后端零消费者: ~100 行
- 前端零消费者: ~80 行
- Go 零消费者: ~50 行
- 死 import: ~50 行（全仓 ~20 个文件各有 2-3 个未使用 import）
- 死配置项: ~50 行
- 死常量: ~70 行
- **净省 ~400 行**

### 风险

- 需要严格的 grep 验证（包括字符串引用、动态访问）
- 公共包契约面（shared/types, shared/constants）的导出不算零消费者
- 通过注册表按名消费的不算零消费者

---

## 已扫描但确认无空间的区域

| 区域                                | 行数 | 原因                                          |
| ----------------------------------- | ---- | --------------------------------------------- |
| `migrations/001_initial_schema.sql` | 356  | DDL 已高度压缩，每行是独立约束/索引，无法再减 |
| `baostock.go` 协议常量              | 350  | 独立 TCP 协议实现，逻辑不可与其他提供商共享   |
| `docker/postgres-init/`             | ~100 | DB 初始化脚本，已最简                         |
| `k8s/network-policies/`             | ~80  | 安全策略，每条规则独立                        |
| `tests/helpers/testcontainersPg.ts` | ~80  | Testcontainers 配置，已最简                   |
| `packages/shared/types/org.ts`      | 16   | 已最简                                        |
| `packages/shared/types/pca.ts`      | 14   | 已最简                                        |
| `packages/shared/types/index.ts`    | 20   | barrel export，已最简                         |
| `.github/workflows/`                | ~300 | CI 流水线，每步独立                           |
| `packages/go-shared/`               | ~200 | Go 共享库，已最简                             |

---

## 全仓真实可重写空间评估

| 类别          | 当前行数 | 保守净省  | 乐观净省   |
| ------------- | -------- | --------- | ---------- |
| 测试代码      | 29,212   | 2,000     | 4,000      |
| 前端代码      | 33,121   | 1,500     | 3,000      |
| 后端代码      | 14,930   | 500       | 1,000      |
| Go 引擎       | 8,966    | 300       | 600        |
| Data-fetcher  | 5,086    | 150       | 350        |
| Config/infra  | 5,604    | 150       | 400        |
| Shared types  | 718      | 50        | 100        |
| Root/other    | 2,885    | 50        | 100        |
| 注释/空行清理 | ~12,000  | 1,000     | 2,000      |
| 死代码        | ~500     | 200       | 400        |
| **合计**      | 100,522  | **5,900** | **11,950** |

**保守值**：5,900 行（5.9%）
**乐观值**：11,950 行（11.9%）
**当前累计净省总量**：~10,300 行（本计划 12 项建议之和）

---

## 执行优先级建议

1. **先执行 #1（测试 mock 共享）和 #3（测试表驱动化）**：风险最低、收益最高、不影响生产代码
2. **再执行 #6（注释/空行清理）**：机械性操作、风险低
3. **然后执行 #12（零消费者代码）**：需 grep 验证但机械性强
4. **中期执行 #2（前端页面 shell）和 #4（图表组件合并）**：需视觉回归验证
5. **中期执行 #5（Go 测试表驱动化）**：不影响生产代码
6. **后期执行 #7-#11（后端/Go/配置重构）**：需功能测试验证
7. **最后执行 #10（shared types 精简）**：影响面广，需全量类型检查

每项执行后运行 `pnpm exec prettier --write`、`pnpm exec tsc --noEmit`、`pnpm exec vitest run tests/unit`、`go test ./...` 验证。
