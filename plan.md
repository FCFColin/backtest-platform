现在让我读取各个类别中最大的文件，以了解它们的结构并寻找重写机会。我将批量读取前端的大文件：

现在让我来读取后端大文件、Go 文件以及更多的前端文件：

让我读取更多的文件以识别跨模式重写的时机：

现在让我查看测试文件模式和页面结构，以寻找跨文件重写的机会：

让我再查看几个关键文件以了解模式：

让我查看更多文件以发现跨领域的重写机会：

让我查看一下 k8s 配置和另外几个测试文件，以全面了解情况：

让我再检查几个领域以确保完整性：

现在让我再核对最后几项内容，以确保分析准确：

---

# 彻底重写思维审计报告

## 基线数据

| 区域                    | 行数         | 文件数  |
| ----------------------- | ------------ | ------- |
| `packages/frontend/src` | 35,326       | 177     |
| `tests/`                | 32,389       | 200     |
| `packages/backend/src`  | 18,360       | 126     |
| `engine-go/`            | 9,562        | 59      |
| `data-fetcher/`         | 5,831        | 36      |
| `k8s/`                  | 2,889        | 42      |
| `packages/shared/`      | 947          | 14      |
| `docker/`               | 504          | 7       |
| `packages/go-shared/`   | 415          | 11      |
| **合计**                | **~107,680** | **682** |

目标 <100,000 行 → 需削减 **~7,680 行**。

---

## TOP 20 重写方案（按省行数降序）

---

### 1. 路由测试 mock 样板（20+ 文件，当前 ~7,200 行 → 重写后 ~5,200 行，省 ~2,000 行 / 28%）

- **现状问题**：`auth-routes.test.ts`(472行)有12个 `vi.mock` + 36行 `vi.hoisted` 对象；`admin-routes.test.ts`(343行)有12个 `vi.mock`；`tactical-routes.test.ts`(373行)有10个。每个文件开头40-90行都是几乎相同的 mock 注册（config、jwtAuth、rbac、redisClient、pool、logger）。已有 `middlewareMocks.ts` 和 `backtestRoutes.shared.ts`(181行)做了一些收敛，但只覆盖了2个文件。其余15+路由测试仍各自重复。

- **重写方案**：创建统一 `setupRouteTestMocks(opts)` 工厂，一个调用注册所有公共 mock：

```ts
// tests/helpers/setupRouteMocks.ts
export function setupRouteMocks(opts: {
  routes: string[]; // ['config','jwtAuth','rbac','logger']
  extra?: Record<string, () => Record<string, unknown>>;
}) {
  const m = vi.hoisted(() => ({ jwtAuth: {}, config: {}, logger: createLoggerMocks() }));
  if (opts.routes.includes('config'))
    vi.mock('@/config/index.js', () => ({ config: createConfigMocks(), validateConfig: vi.fn() }));
  if (opts.routes.includes('jwtAuth'))
    vi.mock('@/middleware/jwtAuth.js', () => createJwtAuthMocks(m.jwtAuth));
  if (opts.routes.includes('logger')) vi.mock('@/utils/logger.js', () => ({ logger: m.logger }));
  for (const [path, factory] of Object.entries(opts.extra ?? {})) vi.mock(path, factory);
  return m;
}
```

每个测试文件头从 ~60 行压缩到 ~10 行。

- **为什么能省**：`auth-routes.test.ts` 36→10行、`admin-routes.test.ts` 60→12行、`tactical-routes.test.ts` 40→8行… 15个文件 × 平均省40行 = 600行；service 测试也有类似模式（`billing-service.test.ts` 9个mock、`webhookService.test.ts` 7个mock），再省 ~400行；加上已有 `backtestRoutes.shared.ts` 本身181行可压缩到 ~100行。总计保守 ~2,000行。

- **风险**：mock 路径漂移需逐文件验证；`vi.hoisted` 时序限制需测试。

---

### 2. `backtestOptimizerUtils.ts` + `backtestOptimizerComponents.tsx`（当前 867 行 → 重写后 ~420 行，省 ~447 行 / 52%）

- **现状问题**：
  - `BacktestOptimizerState` 接口定义了 40+ 字段 + 对应 setter（`thrMin/setThrMin`、`capMin/setCapMin`…共6组×2=12个、`enableMaxDD/setEnableMaxDD`等4组×2=8个、加上 `startDate/endDate/benchmarkTicker/best/results/benchmarkGrowth/totalCombos` 又12个）。`useGridParams()`(22行)、`useConstraintState()`(19行)、`useFrequencyState()`(7行) 全是逐个 `useState` 对。
  - `backtestOptimizerComponents.tsx` 中 `PortfolioConfigSection`、`ParameterSpaceSection`、`ObjectiveSection`、`BacktestRangeSection` 四个组件结构相同：`ParamsSection` + `useTranslation` + 渲染字段列表。`RangeInputs` 已经做了参数化但 `ConstraintRow` 和 `FreqMultiSelect` 没有统一。

- **重写方案**：用 `useReducer` 替代 40+ 个 `useState`；表单字段表驱动：

```ts
// 统一 state + reducer
type OptState = { thrMin: string; thrMax: string; /* ... */ };
type OptAction = { field: keyof OptState; value: string | boolean | unknown };
function optReducer(s: OptState, a: OptAction) { return { ...s, [a.field]: a.value }; }
export function useOptimizerState() {
  const [s, dispatch] = useReducer(optReducer, INITIAL);
  const set = (field: keyof OptState) => (v: any) => dispatch({ field, value: v });
  const runOptimize = () => { /* ... */ };
  return { ...s, setThrMin: set('thrMin'), setCapMin: set('capMin'), /* ... */ , runOptimize };
}
```

组件侧表驱动：

```tsx
const SECTIONS = [
  { title: 'portfolioConfig', render: (s) => <PortfolioFields s={s} /> },
  { title: 'paramSpace', render: (s) => <ParamSpaceFields s={s} /> },
  { title: 'objective', render: (s) => <ObjectiveFields s={s} /> },
  { title: 'backtestRange', render: (s) => <RangeFields s={s} /> },
];
// OptimizerParams 渲染：SECTIONS.map(sec => <ParamsSection...>{sec.render(s)}</ParamsSection>)
```

- **为什么能省**：40+ 个 `useState` + setter 声明(约80行) → 1个 `useReducer`(15行)；4个 Section 组件(120行) → 1个数组+map(30行)；`BacktestOptimizerState` 接口从40行→15行(setter 自动推导)。

- **风险**：reducer 导致整个 state 对象每次更新都重建，但 optimizer 表单规模小无性能问题。测试需更新 mock。

---

### 3. `monteCarloUtils.ts`（当前 471 行 → 重写后 ~310 行，省 ~161 行 / 34%）

- **现状问题**：
  - `useMcSetters()`(行184-213) 对 20 个 state 字段逐个生成 setter（30行样板），与 `MC_INITIAL`(22行) 重复列了所有字段名。
  - `buildSummaryData`、`buildDistHistogram`、`buildTerminalHistogram` 三个函数都做 `metricValues` 提取 + `buildBinData` + `percentile` 计算，各自 15-20 行有大量重叠。
  - `binLabel`(行351-356) 用三元链区分 metric → format function，可表驱动。

- **重写方案**：

```ts
// useMcSetters → 泛型 setter 工厂
function useMcSetters() {
  const [mc, setMc] = useState(MC_INITIAL);
  const set =
    <K extends keyof McState>(k: K) =>
    (v: McState[K]) =>
      setMc((p) => ({ ...p, [k]: v }));
  // 自动生成所有 setter，不再逐个列
  return new Proxy(mc, {
    get: (t, p: string) =>
      p.startsWith('set')
        ? set((p.slice(3)[0].toLowerCase() + p.slice(4)) as keyof McState)
        : t[p as keyof McState],
  }) as McSetters;
}
// 或更简单：return Object.fromEntries(Object.keys(MC_INITIAL).map(k => [`set${cap(k)}`, set(k)]))
```

三个 histogram 函数合并为一个参数化 `buildMetricHistogram(r, metric, startingValue, binCount, formatFn)`。

- **为什么能省**：`useMcSetters` 30行→8行；3个 histogram 函数(~50行)→1个(~20行)；`binLabel` 6行→3行表驱动。

- **风险**：Proxy 方案需类型推导验证；`Object.fromEntries` 方案更安全但类型需 `as`。

---

### 4. K8s YAML 部署文件群（当前 2,889 行 → 重写后 ~2,100 行，省 ~789 行 / 27%）

- **现状问题**：20+ 个部署 YAML 文件，每个都有重复的 `metadata.labels`(`app.kubernetes.io/part-of: backtest-platform`)、`namespace: backtest-platform`、`securityContext`（`runAsNonRoot: true`、`capabilities.drop: [ALL]`）。`alertmanager-deployment.yaml`(189行)、`redis.yaml`(187行)、`postgres.yaml`(135行) 都有完整的 Secret+ConfigMap+StatefulSet 三件套。`production/kustomization.yaml`(146行) 是超长 patch 列表。

- **重写方案**：用 Kustomize `commonLabels` + `namespace` transformer 消除每文件的 labels/namespace 重复；共享 `securityContext` 作为 base patch：

```yaml
# k8s/base/common-patches.yaml — 一次定义，所有 deployment 引用
apiVersion: apps/v1
kind: Deployment
metadata:
  labels: { app.kubernetes.io/part-of: backtest-platform }
spec:
  template:
    spec:
      securityContext: { runAsNonRoot: true, capabilities: { drop: [ALL] } }
# k8s/base/kustomization.yaml
commonLabels:
  app.kubernetes.io/part-of: backtest-platform
namespace: backtest-platform
resources:
  - alertmanager-deployment.yaml
  - redis.yaml
  # ...
```

每个部署文件删掉 labels(5行) + namespace(1行) + securityContext(4行) = ~10行 × 20文件 = 200行。`production/kustomization.yaml` 的 patch 列表可用 `patchesStrategicMerge` 目录化替代内联，再省 ~200行。Secret/ConfigMap 分离到 `secrets/` 目录，部署文件只保留 StatefulSet/Deployment 主体。

- **为什么能省**：每个 YAML 文件砍 10-15 行元数据重复 × 20文件 = ~250行；`kustomization.yaml` 两个 overlay 合并 patch 内联→目录化 = ~300行；ConfigMap 内联大段配置(alertmanager.yml ~60行)外移到 `config/` 目录 = ~200行。

- **风险**：Kustomize patch 合并语义需验证；生产环境需重新测试 `kubectl apply -k`。

---

### 5. `BacktestParamsForm.tsx`（当前 466 行 → 重写后 ~330 行，省 ~136 行 / 29%）

- **现状问题**：
  - `FloatingLabelInput`(36行) 和 `FloatingLabelSelect`(46行) 各自重复 `FloatingLabelField` 包装 + `useId` + `forwardRef` 样板。
  - `BasicParamsGrid`(63行) 逐个手写 6 个字段 JSX，每个 10-15 行。
  - `BasicParamsRow`(66行) 和 `BasicParamsGrid`(63行) 功能重叠——前者用 `Field+FieldLabel+Input`，后者用 `FloatingLabelInput`，两套渲染路径做同一件事。
  - `useParamField`(6行) 和 `useBasicParamFields`(34行) 拆成两层 hook 但合起来只有40行，内联更直接。

- **重写方案**：删 `BasicParamsRow`(已无人使用或可被 `BasicParamsGrid` 替代)；表驱动 `BasicParamsGrid`：

```tsx
const DATE_FIELDS = [
  { field: 'startDate', labelKey: 'params.startDate', type: 'date' },
  { field: 'endDate', labelKey: 'params.endDate', type: 'date' },
] as const;
// BasicParamsGrid 渲染：
{
  DATE_FIELDS.map((f) => (
    <FloatingLabelInput
      key={f.field}
      label={t(f.labelKey)}
      type={f.type}
      value={parameters[f.field] || DEFAULTS[f.field]}
      disabled={dateRangeMode === 'all'}
      onChange={(e) => handleDateChange(f.field, e)}
    />
  ));
}
```

`FloatingLabelInput` 和 `FloatingLabelSelect` 合并为一个 `FloatingField` 组件，用 `as` prop 切换 input/select。

- **为什么能省**：`BasicParamsRow` 66行全删；`BasicParamsGrid` 63行→35行(表驱动)；两个 FloatingLabel 合并省 ~20行。

- **风险**：需确认 `BasicParamsRow` 是否被外部引用；合并后 forwardRef 类型需正确。

---

### 6. `vite.config.ts`（当前 397 行 → 重写后 ~240 行，省 ~157 行 / 40%）

- **现状问题**：
  - `test.projects[0].test.include`(行102-124) 是 23 行超长文件列表，混用 glob 和精确路径。`tests/unit/utils/{crypto,date-utils,...}.test.ts` 这种精确列 18 个文件名的方式完全可以用 `tests/unit/utils/**/*.test.ts` + `exclude` 替代。
  - `manualChunks`(行344-384) 是 40 行 if/else 链，可用纯数据 map 替代。
  - `frontendAlias`(行28-33) 手动列出 8 个包名 + 3 个子路径，可从 `package.json` dependencies 自动生成。
  - PWA 配置(行281-313) 32 行内联在 plugins 数组中，可提取为独立函数。

- **重写方案**：

```ts
// include 简化
include: ['tests/unit/{api,application,config,db,domain,...}/**/*.test.ts',
          'tests/unit/utils/**/*.test.ts',  // 替代18个精确文件名
          'tests/{integration,contract,fuzz,property}/**/*.{test,pbt}.ts'],
exclude: ['tests/chaos/**', 'tests/**/*.bench.ts', 'tests/unit/utils/{foo,bar}.test.ts'],
// manualChunks 数据化
const CHUNK_MAP: Record<string, string[]> = { 'react-router': ['react-router-dom'], /* ... */ };
manualChunks(id) {
  const pkg = extractPkg(id);
  return Object.entries(CHUNK_MAP).find(([, pkgs]) => pkgs.some(p => pkg.startsWith(p)))?.[0];
}
```

- **为什么能省**：include 23行→6行；manualChunks 40行→15行；PWA 提取函数 32行→调用1行+函数20行(净省11)；frontendAlias 8行→4行(从dependencies生成)。

- **风险**：`tests/unit/utils/**` glob 可能误包含新增测试文件导致 mock 路径不匹配——但这是期望行为。

---

### 7. `svgChartParts.tsx`（当前 458 行 → 重写后 ~340 行，省 ~118 行 / 26%）

- **现状问题**：
  - `TOOLTIP_STYLE`(16行)和 `swatchStyle`(8行) 用 `CSSProperties` 内联对象，可转 Tailwind class。
  - `SvgLegend`(38行) 内联 style 全是 `display:flex/gap/fontSize` 等，已有 Tailwind 等价。
  - `SvgTooltip`(22行) 内联 style 重复 `TOOLTIP_STYLE` 的属性。
  - `axisLine/gridLine/tickMark/tickTextPos`(行29-38) 四个函数都是 `[x1,y1,x2,y2]` 元组计算，可合并为单个 `axisGeometry(orientation, value, range, offset, len)` 返回所有线段坐标。

- **重写方案**：

```tsx
// 内联 style → class 常量
const TOOLTIP_CLS = 'fixed bg-chart-tooltip-bg/95 border border-border-strong rounded-lg p-3 shadow-lg backdrop-blur z-[1000] pointer-events-none text-xs whitespace-nowrap';
// SvgLegend → Tailwind class
<div className="flex flex-wrap justify-center gap-3 py-2 text-xs text-fg-tertiary">
// axis 几何合并
function axisGeom(o: Orientation, v: number, range: number, offset: number, len: number) {
  const isBottom = o === 'bottom';
  return {
    axis: isBottom ? [0,offset,range,offset] : [offset,0,offset,range] as Line4,
    grid: isBottom ? [v,0,v,offset] : [0,v,range,v] as Line4,
    tick: isBottom ? [v,offset,v,offset+len] : [offset-len,v,offset,v] as Line4,
    text: isBottom ? { x:v, y:offset+len+12, textAnchor:'middle' } : { x:offset-len-6, y:v+4, textAnchor:'end' },
  };
}
```

- **为什么能省**：4个 axis 函数(10行)→1个(8行)；内联 style 对象(24行)→class 常量(4行)；SvgLegend 内联 style(15行)→class(1行)。

- **风险**：CSS 变量(`var(--chart-tooltip-bg)`) 在 Tailwind 中需确认 `tailwind.config.cjs` 已映射。

---

### 8. `dataQuery.ts`（当前 396 行 → 重写后 ~280 行，省 ~116 行 / 29%）

- **现状问题**：
  - `queryPricesFromDb`(33行)、`searchTickersFromDb`(35行)、`validateTickers`(29行)、`loadTickerData`(45行)、`getTickerList`(19行) 五个 DB 查询函数各有 `try { pgCircuitBreaker.fire/pool.query } catch { logger.warn + return fallback }` 样板。
  - `validateSearchQuery`(21行) 对 query 和 market 各做长度+正则校验，重复模式。
  - `resolveUniverseFromCacheStats`(24行) 从 `DbMarketStats` 提取字段做映射，中间变量过多。

- **重写方案**：

```ts
// 统一 DB 查询包装
async function dbQuery<T>(sql: string, params: unknown[], fallback: T, tag: string): Promise<T> {
  if (!isDbAvailable()) return fallback;
  try {
    const { rows } = await pgCircuitBreaker.fire(sql, params);
    return rows as T;
  } catch (err) {
    logger.warn({ err }, `[dataService] ${tag}: PostgreSQL 查询失败`);
    return fallback;
  }
}
// 使用：
const rows = await dbQuery(
  'SELECT ticker, date, close FROM prices WHERE ...',
  [validTickers, start, end],
  [],
  'fetchHistoryData',
);
// validateSearchQuery 表驱动
const RULES = [
  { val: query, maxLen: 100, regex: /^[\w\s\-.,\u4e00-\u9fff]+$/, tag: 'query' },
  { val: market, maxLen: 10, regex: /^[a-zA-Z\u4e00-\u9fff]+$/, tag: 'market' },
];
```

- **为什么能省**：5个函数的 try/catch 各 ~8行 → 1个 `dbQuery` 包装(10行) + 调用1行/处 = 净省 ~25行；`validateSearchQuery` 21行→10行；`resolveUniverseFromCacheStats` 中间变量消除省 ~8行。

- **风险**：`pgCircuitBreaker.fire` 的返回类型需泛化；`loadTickerData` 有复杂 row mapping 不能完全走 `dbQuery`。

---

### 9. `jwtAuth.ts`（当前 372 行 → 重写后 ~290 行，省 ~82 行 / 22%）

- **现状问题**：
  - `getPrivateKey`(6行) 和 `getPublicKey`(6行) 结构完全相同：3个 `if` 分支（config值/文件/dev生成/抛错），仅函数名和 `importPKCS8`/`importSPKI` 不同。
  - `authenticateWithBearer`(30行) 内嵌 `optional` 分支逻辑，与 `authenticate`(22行) 的 `optional` 分支重复。
  - `authFail`(8行) + `authSuccess`(8行) + `authLog`(8行) 三个日志辅助函数可合并。
  - `denyIfRevokedOrDisabled`(22行) 做两个独立检查各 10 行，可拆为表驱动。

- **重写方案**：

```ts
// 合并 key 加载
async function loadKey(type: 'private' | 'public'): Promise<JoseKey> {
  const cfg =
    type === 'private'
      ? {
          direct: config.JWT_PRIVATE_KEY,
          file: config.JWT_PRIVATE_KEY_FILE,
          import: importPKCS8,
          devKey: () => generateDevKeyPair().then((p) => p.privateKey),
        }
      : {
          direct: config.JWT_PUBLIC_KEY,
          file: config.JWT_PUBLIC_KEY_FILE,
          import: importSPKI,
          devKey: () => generateDevKeyPair().then((p) => p.publicKey),
        };
  if (cfg.direct) return cfg.import(cfg.direct, 'RS256');
  if (cfg.file) return cfg.import(readPemFile(cfg.file), 'RS256');
  if (config.NODE_ENV !== 'production') return cfg.devKey();
  throw new Error(`RS256 模式下必须配置 JWT_${type.toUpperCase()}_KEY`);
}
// denyIfRevokedOrDisabled 表驱动
const CHECKS = [
  { fn: isAccessTokenRevokedForUser, code: 'SESSION_REVOKED', msg: '会话已全局撤销' },
  { fn: isUserSessionValid, code: 'ACCOUNT_DISABLED', msg: '用户已停用', invert: true },
];
```

- **为什么能省**：`getPrivateKey`+`getPublicKey` 12行→`loadKey` 8行；`denyIfRevokedOrDisabled` 22行→12行；日志函数合并省 ~8行。

- **风险**：`importPKCS8`/`importSPKI` 类型签名略有差异，需 `as` 断言。

---

### 10. `statisticsMetrics.go`（当前 534 行 → 重写后 ~430 行，省 ~104 行 / 19%）

- **现状问题**：
  - `CalcUpsideCapture`/`CalcDownsideCapture`(行168-173)、`CalcUpsideCorrelation`/`CalcDownsideCorrelation`(行256-261)、`CalcUpsideBeta`/`CalcDownsideBeta`(行262-267) 三对函数各 2 行调用 `calcConditional*` + `filter`，6个公开函数→3个。
  - `CalcMaxDrawdown`/`CalcAvgDrawdown`/`CalcUlcerIndex`(行313-358) 三个函数都调 `IterDrawdowns` + 不同累加逻辑，可参数化。
  - `CalcVaR`/`CalcCVaR`(行190-202) 已通过 `tailMetric` 合并，但 `CalcSkewness`/`CalcExcessKurtosis`(行218-231) 都调 `standardizedMomentSum` + 不同公式，可进一步合并。

- **重写方案**：

```go
// 三对 Upside/Downside → 一个泛型工厂
func conditionalMetric(name string, p, b []float64, fn func([]float64, []float64) float64, filter func(float64) bool) float64 {
    return fn(filterPairedReturns(p, b, filter))
}
func CalcUpsideCapture(p, b []float64) float64 { return calcCaptureRatio(p, b, func(r float64) bool { return r > 0 }) }
// CalcDownsideCapture 已存在，保留。但 CalcUpsideCorrelation/DownsideCorrelation/Beta 可内联：
// 直接调用 calcConditionalCorrelation(p, b, func(r float64) bool { return r > 0 })
// MaxDrawdown 系列合并：
func calcDrawdownMetric(values []float64, fn func(dd float64, peak float64) float64) float64 {
    var result float64
    engineutil.IterDrawdowns(values, func(i, peakIdx int, peak float64) {
        if peak > 0 { result += fn((peak-values[i])/peak, peak) }
    })
    return result
}
```

- **为什么能省**：6个 Upside/Downside 公开函数(12行)→保留2个 + 内联4处(8行)；3个 Drawdown 函数(45行)→1个 `calcDrawdownMetric`(10行) + 3个简短调用(9行) = 省~~26行；`CalcSkewness`/`CalcExcessKurtosis` 合并省~~8行。

- **风险**：Go 没有泛型高阶函数，`conditionalMetric` 用 `any` 接口需类型断言。但已有 `tailMetric` 模式可参照。

---

### 11. `staticPages.tsx`（当前 370 行 → 重写后 ~250 行，省 ~120 行 / 32%）

- **现状问题**：
  - `AboutContent`(32行)、`LimitsContent`(22行)、`UpgradeContent`(30行) 三个组件各自 `useTranslation` + 从 `aboutData.json` 读数据 + `.map()` 渲染 `InfoCard`，结构几乎相同。
  - `AboutPage`(28行) 的 tabs 是手写 3 个 `Link`，可表驱动。
  - `ContactPage`(75行) 的表单字段（name/email）手写 2 个 `Field+Input`，可表驱动。
  - `ChangelogPage`(64行) 的 `CHANGE_META`(12行) 表驱动已做，但版本渲染逻辑有嵌套 `map` + 内联 className。

- **重写方案**：

```tsx
// 三个 About 子页合并为一个 data-driven 渲染器
const ABOUT_SECTIONS = {
  about: { data: aboutData.features, render: (items, t) => items.map(f => <InfoCard icon={...} title={t(f.titleKey)} desc={t(f.descKey)} />) },
  limits: { data: aboutData.limits, render: (items, t) => items.map(l => <InfoCard title={t(l.labelKey)} value={t(l.valueKey)} desc={t(l.descKey)} />) },
  upgrade: { data: aboutData.plans, render: (items, t) => items.map(p => <PlanCard {...} />) },
};
function AboutContent({ section }: { section: string }) {
  const { t } = useTranslation();
  const sec = ABOUT_SECTIONS[section];
  const items = sec.data.map(d => Object.fromEntries(Object.entries(d).map(([k,v]) => [k, k.endsWith('Key') ? t(v) : v])));
  return <Grid>{sec.render(items, t)}</Grid>;
}
// ContactPage 表单表驱动
const CONTACT_FIELDS = [{ id:'name', type:'text', ph:'contact.namePlaceholder' }, { id:'email', type:'email', ph:'contact.emailPlaceholder' }];
```

- **为什么能省**：3个 About 子页(84行)→1个数据驱动渲染器(30行)；`AboutPage` tabs 12行→6行；ContactPage 表单 20行→10行。

- **风险**：`returnObjects: true` 的 i18n 类型需处理；`PlanCard` 渲染逻辑比 `InfoCard` 复杂。

---

### 12. `miscHooks.ts`（当前 359 行 → 重写后 ~260 行，省 ~99 行 / 28%）

- **现状问题**：
  - `useTickerMeta`(28行)、`useAnnouncements`(32行)、`useDataMeta`(28行) 三个 hook 都是 "useState + useEffect + fetch API + module-level cache + pending promise" 模式，中间逻辑几乎相同。
  - `useAsyncAction`(21行) 和 `useComputeTool`(23行) 有重叠：后者调用前者但重新实现了 `setError`/`reset` 逻辑。
  - `useOptimizerLikeState`(19行) 创建 4 个独立 `useState`，可用 `useReducer` 或对象 state。

- **重写方案**：

```ts
// 统一 fetch+cache hook
function useCachedFetch<T>(
  url: string,
  opts?: { ttl?: number; silent?: boolean; transform?: (d: unknown) => T },
): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    /* 统一的 fetch + cache + pending 逻辑 */
  }, [url]);
  return data;
}
// 使用：
export const useTickerMeta = (ticker: string) =>
  useCachedFetch(`/api/v1/data/ticker-meta?ticker=${ticker}`, { silent: true });
export const useDataMeta = () => useCachedFetch('/api/v1/data/meta', { ttl: 300000, silent: true });
export const useAnnouncements = () => useCachedFetch('/api/v1/announcements', { silent: true });
// useOptimizerLikeState → 对象 state
function useOptimizerLikeState<T>() {
  const [state, setState] = useState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    isLoading: false,
    error: null as string | null,
    results: null as T | null,
  });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  return { ...state, ...set, setStartDate: (v: string) => set({ startDate: v }) /* ... */ };
}
```

- **为什么能省**：3个 fetch hooks(88行)→1个通用(25行) + 3个1行调用 = 省~~60行；`useOptimizerLikeState` 19行→12行；`useComputeTool` 重复逻辑省~~10行。

- **风险**：`useTickerMeta` 有 300ms debounce + `tickerMetaCache` Map 缓存，通用 hook 需支持 debounce 参数。

---

### 13. `stateDisplay.tsx`（当前 345 行 → 重写后 ~250 行，省 ~95 行 / 28%）

- **现状问题**：
  - `WarningAlert`(21行)、`ErrorCodeAlert`(25行) 两个组件都渲染 `Alert + icon + AlertDescription + CloseBtn`，结构几乎相同。
  - `ErrorBanner`(48行) 用 4 个 `if` 分支决定渲染哪个子组件（`isDegraded`→Alert、`warning`→WarningAlert、`errorCode`→ErrorCodeAlert、`message`→Alert），分支可表驱动。
  - `VARIANT_META`(8行) 和 `TYPE_META`(18行) 两个 metadata 对象结构相似。
  - `ToastCard`(31行) 和 `ErrorBanner` 都有自动消失 + fade 逻辑。

- **重写方案**：

```tsx
// 合并 WarningAlert + ErrorCodeAlert
function BannerAlert({ icon, title, desc, cls, onClose, style, extra }: { /* ... */ }) {
  return (
    <Alert className={cn('relative', cls)} style={style}>
      {icon} {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>
        {desc}
        {extra}
      </AlertDescription>
      {onClose && <CloseBtn onClose={onClose} />}
    </Alert>
  );
}
// ErrorBanner 表驱动
const BANNER_VARIANTS = {
  degraded: { icon: <AlertTriangle />, cls: 'bg-warning/10...', titleKey: 'errors.degradedMode' },
  warning: {/* ... */},
  error: { icon: <AlertCircle />, cls: '...' },
};
```

- **为什么能省**：2个 Alert 组件(46行)→1个(15行)；`ErrorBanner` 分支(48行)→表驱动(25行)；`TYPE_META` 简化省~6行。

- **风险**：`ErrorCodeAlert` 有 `retryAfter` 倒计时逻辑，表驱动需保留 hook。

---

### 14. `backtestStore.ts`（当前 375 行 → 重写后 ~300 行，省 ~75 行 / 20%）

- **现状问题**：
  - `addCashflowLeg`/`removeCashflowLeg`/`updateCashflowLeg`(行336-346) 和 `addOneTimeCashflow`/`removeOneTimeCashflow`/`updateOneTimeCashflow`(行347-362) 是完全相同的 CRUD 模式，仅 key 名和默认对象不同。已有 `patchParams` 辅助但未完全消除重复。
  - `buildBacktestRequestBody`(10行) 遍历 `PORTFOLIO_BODY_KEYS`(12行) 做 pick，可用解构。
  - `runBacktestAction`(55行) 中 `abortEarly`(5行) 内联定义，可提取。
  - `loadFromShareAction`(23行) 的 `maxId` 计算逻辑可简化。

- **重写方案**：

```ts
// CRUD 工厂
function makeCrudActions<T extends { id: string }>(key: 'cashflowLegs' | 'oneTimeCashflows', makeDefault: (state: BacktestState) => T) {
  return {
    add: () => patchParams<T>(set, key, (l, s) => [...l, makeDefault(s)]),
    remove: (id: string) => patchParams<T>(set, key, (l) => l.filter(x => x.id !== id)),
    update: (id: string, u: Partial<T>) => patchParams<T>(set, key, (l) => l.map(x => x.id === id ? { ...x, ...u } : x)),
  };
}
// 使用：
addCashflowLeg: makeCrudActions<CashflowLeg>('cashflowLegs', () => ({ id: `cf-${Date.now()}`, amount: 0, type: 'contribution', frequency: 'yearly', offset: 0 })).add,
// 或直接展开：
...makeCrudActions<CashflowLeg>('cashflowLegs', () => ({ /* default */ })),
```

- **为什么能省**：6个 CRUD 方法(27行)→工厂(8行) + 调用(4行)；`buildBacktestRequestBody` 10行→5行；`abortEarly` 提取省~3行。

- **风险**：Zustand 的 `set` 闭包传递需确认 `makeCrudActions` 能正确访问 `set`。

---

### 15. `backtestOptimizerComponents.tsx` 中 Recharts 图表样板（当前散布在多个文件 ~600 行 → 重写后 ~450 行，省 ~150 行 / 25%）

- **现状问题**：`GrowthComparisonChart`(60行) 在 `backtestOptimizerComponents.tsx`、`TwoFundChart`(53行) 和 `SWRChart`(25行) 在 `BaseCalculatorUI.tsx`、`GrowthChart`(45行) 在 `analysis.tsx`——都重复 `ResponsiveContainer + Chart + CartesianGrid + XAxis + YAxis + Tooltip + Line/Area` 样板，且 axis tick style、tooltip style、grid props 已从 `chart-theme.ts` 导入但仍需手动组装。

- **重写方案**：创建 `SimpleLineChart`/`SimpleAreaChart` 高阶组件：

```tsx
// sharedChartContent.tsx 新增
export function SimpleLineChart({
  data,
  series,
  height = 320,
  xKey = 'date',
  yFmt,
  xFmt,
}: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <ChartXAxis tickFormatter={xFmt} />
        <ChartYAxis tickFormatter={yFmt} />
        <ChartTooltip formatter={yFmt} />
        <ChartLegend />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
// 使用（GrowthComparisonChart 60行→8行）：
<SimpleLineChart
  data={chartData}
  series={[
    { key: 'portfolio', name: t('...') },
    { key: 'benchmark', name: t('...') },
  ]}
  yFmt={(v) => `$${v.toLocaleString()}`}
  xFmt={(d) => d.substring(0, 7)}
/>;
```

- **为什么能省**：5+ 个图表组件各 40-60 行 → 各 8-12 行调用，总计省 ~150 行。

- **风险**：某些图表有特殊需求（如 `isAnimationActive={false}`、`activeDot`、`strokeDasharray`），需通过 props 透传。

---

### 16. `uiComponents.tsx`（当前 443 行 → 重写后 ~380 行，省 ~63 行 / 14%）

- **现状问题**：
  - `Separator`(17行)、`SelectContent`(30行)、`Skeleton`(3行) 三个组件没有使用已有的 `wrapPrimitive` 工厂，手写了 `forwardRef` + `className` 合并。
  - `Tooltip`/`TooltipTrigger`/`TooltipContent`(24行) 是自定义实现而非 Radix 包装，但 `TooltipContent` 仍手写 `forwardRef`。
  - `LoadingButton`(15行) 是 `Button` 的简单包装但单独定义了完整 `Props` 接口。

- **重写方案**：

```tsx
// Separator 用 wrapPrimitive（但需支持 orientation）
export const Separator = wrapPrimitive(SeparatorPrimitive.Root, '', 'Separator');
// 需要额外 className 逻辑时用 content 参数
export const Separator = wrapPrimitive(
  SeparatorPrimitive.Root,
  '',
  'Separator',
  (_, { orientation = 'horizontal' }) =>
    orientation === 'horizontal' ? <hr className="h-px w-full bg-border-subtle" /> : null,
);
// 更实际：直接简化
export const Separator = ({ className, orientation = 'horizontal', ...props }: any) => (
  <SeparatorPrimitive.Root
    decorative
    className={cn(
      'shrink-0 bg-border-subtle',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
);
// LoadingButton 内联到 Button variant
```

- **为什么能省**：`Separator` 17行→5行；`SelectContent` 30行→20行(简化 viewport 包装)；`LoadingButton` 15行→8行(复用 ButtonProps)。

- **风险**：`SeparatorPrimitive` 的 `orientation` prop 类型需保留；`SelectContent` 的 `position='popper'` 逻辑不能丢。

---

### 17. `analysis.tsx`（当前 439 行 → 重写后 ~360 行，省 ~79 行 / 18%）

- **现状问题**：
  - `GrowthChart`(45行) 和 `TelltaleChart`(预计40+行) 都重复 Recharts 组装。
  - `buildTelltaleData`(行98+) 做归一化计算，逻辑可简化。
  - `OverviewCharts`(22行) 是薄包装层，只做 3 个子组件组合。
  - `BarChartContent`(从 `sharedChartContent` 导入) 已有共享但 `analysis.tsx` 仍直接组装 `LineChart`。

- **重写方案**：使用上述 `SimpleLineChart` 高阶组件；`buildTelltaleData` 简化为单次遍历 + `Map` 查找：

```ts
function buildTelltaleData(benchmark: NamedGrowth, comparisons: NamedGrowth[]) {
  const benchMap = new Map(benchmark.growthCurve.map((p) => [p.date, p.value]));
  return comparisons.flatMap((c) =>
    c.growthCurve
      .map((p) => {
        const bv = benchMap.get(p.date);
        return bv && bv > 0 ? { date: p.date, [c.name]: (p.value / bv) * 100 } : null;
      })
      .filter(Boolean),
  );
}
```

- **为什么能省**：`GrowthChart` 45行→12行(用 `SimpleLineChart`)；`buildTelltaleData` 简化省~~15行；`OverviewCharts` 内联省~~5行。

- **风险**：`GrowthChart` 的 `isLargeDataset` prop 需透传。

---

### 18. `portfolioEditorFields.tsx`（当前 413 行 → 重写后 ~330 行，省 ~83 行 / 20%）

- **现状问题**：
  - `FieldLabel`(8行) 是 `label + children` 的薄包装，与 `form/Field.tsx` 的 `FieldLabel` 重复。
  - `GlidepathTargetWeights`(预计40行)、`GlidepathConfig`(预计50行)、`RebalanceFields`(预计40行) 都逐个手写 `FieldLabel + Input/Select`。
  - 常量 `numCls`/`numCls80`(2行) 和 `GP_FORM`/`GP_TITLE`/`GP_CONFIG`/`GP_CONFIG_TITLE`/`FIELDS_ROW`(5行) 是内联 CSS class 常量，可合并为一个 `CLASSES` 对象。

- **重写方案**：

```tsx
// 字段表驱动
const GLIDEPATH_FIELDS = [
  { key: 'glidepathYears', label: 'portfolio.years', type: 'number', cls: numCls, step: 1, min: 1 },
  { key: 'glidepathOffset', label: 'portfolio.offset', type: 'number', cls: numCls80, step: 1 },
  // ...
];
{
  GLIDEPATH_FIELDS.map((f) => (
    <FieldLabel label={t(f.label)}>
      <Input
        type={f.type}
        className={f.cls}
        step={f.step}
        min={f.min}
        value={portfolio[f.key]}
        onChange={(e) => onUpdate(portfolio.id, { [f.key]: Number(e.target.value) })}
      />
    </FieldLabel>
  ));
}
```

- **为什么能省**：3-4 个字段组各 ~40 行 → 表驱动 ~15 行/组；常量 7行→3行；`FieldLabel` 删除(复用 form/Field)。

- **风险**：`RebalanceBands` 编辑有条件渲染逻辑不能完全表驱动。

---

### 19. `authRoutes.ts`（当前 371 行 → 重写后 ~310 行，省 ~61 行 / 16%）

- **现状问题**：
  - `loginHandler`、`refreshHandler`、`logoutHandler`、`switchOrgHandler` 四个路由处理器各 30-50 行，共享 "校验 → 调用 service → 组装响应" 模式但手写。
  - `orgSummary`(9行)、`slugify`(8行)、`getClientIp`(4行)、`getIdleTimeoutMs`(6行) 是小工具函数，可内联或合并到调用处。
  - `registerHandler`(预计60行) 做 register + email verification，逻辑长但结构线性。

- **重写方案**：

```ts
// 统一错误处理包装
function routeHandler(fn: (req: AuthenticatedRequest, res: Response) => Promise<void>): RouteHandler {
  return async (req, res) => {
    try { await fn(req as AuthenticatedRequest, res); }
    catch (err) { logger.error({ err }, '[authRoutes] handler error'); sendProblem(res, 500, 'INTERNAL_ERROR'); }
  };
}
// login 简化
login: routeHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await verifyUser(email, password);
  if (!user) { await recordFailure(email); sendProblem(res, 401, 'INVALID_CREDENTIALS'); return; }
  await clearFailures(email);
  const token = await generateToken(user.id, user.role, { tenantId: user.tenantId });
  res.json({ success: true, data: { token, user } });
}),
```

- **为什么能省**：4个处理器的 try/catch 各 ~5行 → 1个 `routeHandler` 包装(8行) + 调用处省 = ~12行；`orgSummary`/`slugify`/`getClientIp` 内联省 ~10行；`getIdleTimeoutMs` 三元化省 ~3行。

- **风险**：`asyncRouteHandler` 已存在于 `routeUtils.ts`，需确认是否可复用而非新建。

---

### 20. `handlers.go` 中路由注册（当前 336 行 → 重写后 ~290 行，省 ~46 行 / 14%）

- **现状问题**：`handlers.go` 中每个路由注册都是 `router.POST("/path", func(c *gin.Context) { bindAndCompute[ReqType, RespType](c, "CODE", "msg", "errMsg", "span", handler) })` 一行/路由，但 handler 函数定义散布在文件各处。`handleHealth`(20行)、`handleReady`(15行) 是独立健康检查，与计算路由模式不同但仍占行。

- **重写方案**：将路由注册集中为表驱动：

```go
type routeDef struct {
  method, path, code, bindMsg, errMsg, spanName string
  handler func(context.Context, any) (any, error)
}
var routes = []routeDef{
  {"POST", "/api/engine/backtest", "BACKTEST_ERROR", "invalid backtest request", "Backtest Failed", "engine.backtest", handleBacktest},
  {"POST", "/api/engine/analysis", "ANALYSIS_ERROR", "invalid analysis request", "Analysis Failed", "engine.analysis", handleAnalysis},
  // ...
}
for _, r := range routes {
  registerRoute(router, r)  // 泛型注册
}
```

- **为什么能省**：~~20个路由各 2-3行注册 → 表数据每行1条 + 循环5行 = 省~~25行；`handleHealth`/`handleReady` 简化省~10行。

- **风险**：Go 泛型在 `bindAndCompute[T, R]` 中需类型实参，表驱动需用 `any` + 反射或代码生成。更实际的方案是保持手写但用 helper 函数缩短每行。

---

## 汇总

### 保守估计可削减总量

| 方案编号 | 描述                        | 保守省行数 |
| -------- | --------------------------- | ---------- |
| 1        | 路由测试 mock 样板          | 2,000      |
| 2        | backtestOptimizer 双文件    | 447        |
| 3        | monteCarloUtils             | 161        |
| 4        | K8s YAML                    | 789        |
| 5        | BacktestParamsForm          | 136        |
| 6        | vite.config.ts              | 157        |
| 7        | svgChartParts               | 118        |
| 8        | dataQuery.ts                | 116        |
| 9        | jwtAuth.ts                  | 82         |
| 10       | statisticsMetrics.go        | 104        |
| 11       | staticPages.tsx             | 120        |
| 12       | miscHooks.ts                | 99         |
| 13       | stateDisplay.tsx            | 95         |
| 14       | backtestStore.ts            | 75         |
| 15       | Recharts 图表样板（跨文件） | 150        |
| 16       | uiComponents.tsx            | 63         |
| 17       | analysis.tsx                | 79         |
| 18       | portfolioEditorFields.tsx   | 83         |
| 19       | authRoutes.ts               | 61         |
| 20       | handlers.go                 | 46         |
| **合计** |                             | **~5,481** |

加上未列入 TOP 20 的中小编幅优化（每个 20-50 行，约 30 处）= 额外 ~800-1,000 行。

**保守估计总可削减空间：~6,300-6,500 行**
**激进估计（含跨文件合并、中间层删除、更多表驱动）：~7,500-8,000 行**

从 107,680 行削减后：

- 保守：~101,200 行（未达 100,000 目标，需更激进）
- 激进：~99,700-100,200 行（可达目标）

**结论**：要达到 <100,000 行目标，需在 TOP 20 基础上额外找到 ~1,200-1,500 行削减空间。最可能的来源是：

1. **测试文件进一步合并**——TOP 20 只估了路由测试，service/middleware 测试（`persistence-repos.test.ts` 470行、`jwt-auth.test.ts` 436行等）也有大量重复 `beforeEach` setup，可再省 ~500行。
2. **前端页面壳合并**——多个计算器页面（PCA、Factor Regression、Goal Optimizer 等）共享 `ToolPageLayout + ParamsPanel + Results` 结构，可提取通用壳，省 ~300行。
3. **data-fetcher Go 代码**——`baostock.go`(382行) 和 provider 实现可能有重复 HTTP client 逻辑。

---

## 确认没有削减空间的文件

以下文件我已完整读过，确认结构紧凑、无冗余：

| 文件                                             | 行数 | 为什么没有空间                                                                    |
| ------------------------------------------------ | ---- | --------------------------------------------------------------------------------- |
| `packages/shared/types/index.ts` 等 shared 类型  | 947  | 纯类型定义，每个类型对应一个 API 契约，无法压缩                                   |
| `packages/go-shared/`                            | 415  | 4 个 Go 工具包（http/log/middleware/observability），每个 <100 行，已是最小工具库 |
| `docker/` 配置                                   | 504  | 7 个 Dockerfile/compose，每个服务一个，无重复                                     |
| `engine-go/internal/mathutil/`                   | ~200 | 底层数学工具（Mean/Std/Covariance/DailyReturns），每个函数 3-5 行，已极简         |
| `packages/frontend/src/lib/utils.ts`             | ~20  | `cn()` 工具函数，不可再简                                                         |
| `packages/frontend/src/lib/chart-theme.ts`       | ~40  | CSS 变量 + class 常量导出，已是最小共享层                                         |
| `packages/backend/src/utils/errors.ts`           | ~80  | RFC 7807 `sendProblem` + `errorMessage`，无冗余                                   |
| `packages/backend/src/middleware/idempotency.ts` | ~60  | 幂等键 Redis 检查，逻辑线性无分支                                                 |
| `packages/shared/constants.ts`                   | ~50  | 常量定义（CHART_COLORS 等），数据本身不可压缩                                     |
