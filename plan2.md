# 全仓"彻底重写思维"审计报告 v5（第二轮：与 plan.md 互补）

**审计范围**：全仓 TS/TSX/JS/Go/CSS/SQL/YAML/MD/配置/测试（排除 node_modules/dist/coverage/.git/.turbo）。
**当前基线**：**~120,564 行**（宽口径含空行注释；空行占 TS/JS/Go 的 5.1%，约 5,378 行）。
**目标解读**：基线 179,541 → 已 -32.9%（>20% 达成）。若按"从当前再减 20%（→ ~96,500）"口径，需 -24,000 行——见文末结构性路径量化。

> **与 plan.md 的关系**：plan.md 是 v4（TOP 20 已覆盖 miscHooks/uiComponents/base.css/dataQuery/jwtAuth/analysis.tsx 等）。本报告为 **v5 新批次**，全部条目不与 plan.md TOP 20 / 跨文件 A/B/C / 近期提交（test merge、k8s 压缩、RBAC/Webhooks 删除、静态页表驱动、backtestStore CRUD 工厂等）重复。所有估算经**本人亲读源文件**校准，比代理初报更保守。

**方法论**：对每个 >200 行文件，从"如果我从零写最短版本"出发对比现状；质疑拆分是否制造样板；跨文件找"一个通用实现 + 数据配置"；查表/单循环/参数化替代 if 链；3+ 相似函数合一；删透传层。

---

## TOP 20（按保守省行数降序）

### 1. `data-fetcher` 四个 REST provider → 通用 `restProvider` + spec 表（491 → ~330，省 ~160 / 33%）

- **现状问题**：`internal/yfinance/yfinance.go`（171）、`akshare/akshare.go`（110）、`finnhub/finnhub.go`（109）、`twelvedata/twelvedata.go`（101）骨架逐字相同：包级 `breaker/httpClient` 变量（4 行）+ `init()` 配 `httpclient.New`（8-12 行）+ `NewProvider()`（3 行）+ `Name()`（3 行）+ `FetchStockDaily` 的日期解析/URL 拼接/`DoGetWithBreaker`/错误包装（~20 行）。已亲读 yfinance.go：唯一差异是 baseURL、URL 模板、keyEnv、delay、UA/headers、解析函数。
- **重写方案**：

```go
type spec struct {
	name, baseURL, keyEnv string
	delay time.Duration
	ua    []string
	headers map[string]string
	priceURL func(ticker string, start, end int64) string
	searchURL func(q string) (string, bool)
	parsePrice  func([]byte) ([]provider.DailyPrice, error)
	parseSearch func([]byte) ([]provider.TickerInfo, error)
}
type restProvider struct{ spec; client *httpclient.Client; breaker *gobreaker.CircuitBreaker }
func (p *restProvider) Name() string { return p.spec.name }
func (p *restProvider) FetchStockDaily(t, s, e string) ([]provider.DailyPrice, error) {
	start, err := providerutil.DateToUnix(s)
	if err != nil { return nil, fmt.Errorf("无效的起始日期 %s: %w", s, err) }
	end, err := providerutil.DateToUnix(e)
	if err != nil { return nil, fmt.Errorf("无效的结束日期 %s: %w", e, err) }
	return httpclient.DoGetWithBreaker(p.breaker, p.client, p.spec.priceURL(t, start, end), p.spec.parsePrice)
}
// SearchTicker: if u, ok := p.spec.searchURL(q); !ok { return nil, nil }; ...
// registry.go 注册处改为: provider.NewProvider("yfinance") 单行
```

- **为什么能省**：4×~70 行骨架 → 1×~85 行通用类型 + 4 个文件只剩 spec + parse 函数。解析函数与响应结构（yfinance ~100 行）不可合并，已从预算中扣除。
- **风险**：中。akshare 有 UA 轮换、yfinance 有 8 条 UA + 4 个 header → spec 需 `ua/headers` 字段；`SearchTicker` 非全部 provider 实现 → `searchURL` 返回 `(url, ok)`；注册表与 `NewProvider(name)` 调用点、`provider_test.go` 需平移；`go test ./...` 验证。

### 2. 路由测试生命周期收拢为 `useRouteHarness`（9 个路由测试 ~2,310 → ~2,190，省 ~120 / 5%）

- **现状问题**：已亲读 `analysisRoutes.test.ts`（701 行）——主体已是 `describe.each(ANALYSIS_CASES)` 表驱动，**没有 180 行空间**；但每个 describe 仍重复 `let server; beforeEach(startExpressApp); afterEach(close)` 六件套（6 个 describe × 6 行），`health-routes.test.ts` 的 4 个 describe 还各重复 `config.METRICS_AUTH_TOKEN` 重置与 auth 矩阵。`tests/helpers/expressApp.ts` 已集中 start/reqJson/postJson，但生命周期未收。
- **重写方案**（`expressApp.ts` 新增）：

```ts
export function useRouteHarness(
  mountPath: string,
  routes: Router,
  auth?: { user: Partial<TestRequest['user']>; tenant?: string },
) {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      if (auth)
        app.use((req, _res, next) => {
          (req as TestRequest).user = { sub: 'user-1', role: 'admin', ...auth.user };
          (req as TestRequest).tenantId = auth.tenant;
          next();
        });
      app.use(mountPath, routes);
    });
  });
  afterEach(async () => {
    await server?.close();
  });
  const base = (p: string) => `${server.url}${mountPath}${p}`;
  return {
    server,
    get: (p: string) => reqJson(base(p), 'GET'),
    post: (p: string, body?: unknown) => reqJson(base(p), 'POST', body),
  };
}
```

- **为什么能省**：9 文件 × 每 describe ~10 行（beforeEach/afterEach/server 变量 + 局部 fetch 包装）→ 每文件 1 行调用。analysisRoutes 6 个 describe、admin-routes、health-routes、persistence-routes 全部受益。
- **风险**：低。`afterEach` 需 `server?.close()` 防测试失败时泄漏；auth 中间件注入顺序与现有 `middlewareMocks.js` 需对齐；org-routes.shared 既有模式已验证。

### 3. `scripts/verify/*.mjs` 文件断言检查 → 表驱动执行器（5 脚本 ~1,552 → ~1,460，省 ~90 / 6%）

- **现状问题**：C-011（HPA 字段，41 行）、C-016（CHANGELOG 日期，44 行）、C-017（migrations 注册核对，46 行）等是同一形状"读文件 + 正则断言 + pass/fail 汇总"的 ~40 行闭包；`runCheck` helper 已存在但断言层未表驱动。
- **重写方案**：

```js
// _lib.mjs 新增
export async function runFileChecks(results, checks) {
  for (const { id, path, must = [], mustNot = [] } of checks)
    await runCheck(results, id, () => {
      const content = readFileContent(path);
      const missing = must.filter((r) => !r.test(content));
      const found = mustNot.filter((r) => r.test(content));
      return missing.length + found.length
        ? { status: 'FAIL', summary: `${path}: ${missing} ${found}` }
        : { status: 'PASS', summary: `${path} ok` };
    });
}
// verify-infra.mjs: C-011 → 1 行表项
await runFileChecks(results, [
  {
    id: 'C-011',
    path: 'k8s/hpas.yaml',
    must: [/stabilizationWindowSeconds/],
    mustNot: [/stabilizationScaleDownSeconds/],
  },
  { id: 'C-016', path: 'CHANGELOG.md', must: [/^## \[\d+\.\d+\.\d+\]\s*-\s*\d{4}-\d{2}-\d{2}/m] },
]);
```

- **为什么能省**：约 8-10 个纯文件断言检查各 35-40 行 → 2-3 行表项。C-007（kustomize build）、C-008/C-009（probe/NetworkPolicy 解析）含真实逻辑，保持函数式。
- **风险**：中。C-016 的 git 日期比较、C-017 的 dir+注册表差集属"校验逻辑"不套表；details 输出结构变化需实跑 `pnpm verify:critical` 确认 0 回归。

### 4. `backtestRoutes.ts` + `jobRoutes.ts` 队列提交端点 → `submitQueueJob` 工厂（751 → ~671，省 ~80 / 11%）

- **现状问题**：已亲读两文件。POST `/portfolio`（backtestRoutes L96-139，44 行）、POST `/backtest-optimizer/optimize`（jobRoutes L115-158，44 行）、POST `/tactical-grid/search`（jobRoutes L160-219，60 行）三个端点同构：`queue.add({type,payload,userId,tenantId,ownerUserId})` → 202 `{jobId,statusUrl}` → catch（前两个 fail-closed 503 + Retry-After，grid 回退同步）。另外 `/runs/:jobId`（L164-175）与 `authorizeJob`（jobRoutes L51-81）的 ownership/tenant 判定逐字重复。
- **重写方案**（`routeUtils.ts`）：

```ts
function submitQueueJob(opts: {
  type: BacktestJobData['type'];
  onQueueDown: 'fail-closed' | 'sync-fallback';
  fallback?: (body: unknown) => Promise<{ success: boolean; data?: unknown }>;
  logMsg: string;
  code: string;
  endpoint: string;
}): RequestHandler {
  return asyncRouteHandler(
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const job = await backtestQueue.add(opts.type, {
          type: opts.type,
          payload: req.body,
          userId: authReq.user?.sub,
          tenantId: authReq.tenantId,
          ownerUserId: ownerOf(authReq),
        } as BacktestJobData);
        res
          .status(202)
          .json({ success: true, data: { jobId: job.id, statusUrl: `/api/v1/jobs/${job.id}` } });
      } catch (queueError) {
        if (opts.onQueueDown === 'fail-closed') {
          sendProblem(res, 503, opts.code, 'Service temporarily unavailable', {
            headers: { 'Retry-After': '30' },
          });
          return;
        }
        const r = await withTimeout(
          opts.fallback!(req.body),
          config.SYNC_COMPUTE_TIMEOUT_MS,
          opts.endpoint,
        );
        r.success
          ? res.json({ success: true, data: r.data })
          : sendProblem(res, 400, 'GRID_BAD_REQUEST');
      }
    },
    { logMsg: opts.logMsg, code: opts.code, endpoint: opts.endpoint },
  );
}
// 另提取 authorizeJobAccess(job, requester, tenantId): boolean 谓词，供 /runs/:jobId 与 /jobs/:id 共用
```

- **为什么能省**：148 行三端点样板 → 工厂 ~35 + 3×4 行配置；双份授权 ~43 行 → 1 个 8 行谓词。grid 的 GRID_TOO_MANY_COMBINATIONS 校验保留在路由声明处。
- **风险**：中。grid 端点 202 当前用 RFC7807 形状（`{status:202, jobId, statusUrl}` 平铺），统一为 `{success,data}` 需前端同步；`/portfolio` 的 statusUrl 前缀 `/api/v1/backtest/runs/` 变更需确认无外部依赖；同步回退超时语义必须原样保留。

### 5. 资产行编辑器跨文件收敛为 `AssetRows`（~80 行）

- **涉及**：`backtestOptimizerComponents.tsx` PortfolioConfigSection（已亲读 L197-248，~40 行）、`GoalOptimizerParams.tsx` AssetConfigSection（~38 行）、`MonteCarloParams.tsx` 资产行。
- **现状问题**：`TickerInput + weight Input + % 后缀 + add/remove 按钮 + 空行补齐` 行结构在两处手写，各自实现 `(a.ticker.length > 2 && a.ticker[i].trim()) || ''` 补齐逻辑与总量显示。
- **重写方案**：

```tsx
function AssetRows({
  assets,
  onUpdate,
  onAdd,
  onRemove,
  showTotal = false,
}: {
  assets: Array<{ ticker: string; weight: string }>;
  onUpdate: (i: number, field: 'ticker' | 'weight', v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  showTotal?: boolean;
}) {
  const total = assets.reduce((s, a) => s + (parseFloat(a.weight) || 0), 0);
  return (
    <div className="flex flex-col gap-2">
      {assets.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={a.ticker}
            onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
            placeholder="Enter ticker, e.g. VTI"
            className="flex-1"
          />
          <div className="relative flex w-[110px] items-center">
            <Input
              type="number"
              value={a.weight}
              onChange={(e) => onUpdate(i, 'weight', e.target.value)}
            />
            <span className="absolute right-2 text-caption text-fg-tertiary">%</span>
          </div>
          {assets.length > 1 && <IconButton icon={X} onClick={() => onRemove(i)} title="Delete" />}
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={onAdd}>
        <Plus />
        {t('Add Ticker')}
      </Button>
      {showTotal && (
        <p className={cn('text-caption', total !== 100 && 'text-danger')}>
          Total: {total.toFixed(1)}%
        </p>
      )}
    </div>
  );
}
```

- **为什么能省**：2-3 处 ~40 行级实现 → 1 个 ~30 行组件 + 每处 2 行调用；顺带消除空行补齐的行为漂移。
- **风险**：中。补齐逻辑（长度为 2 才补齐）需参数保留；样式以 sharedFields Input 为准，需目检。

### 6. 4 个手写 setter hook → 泛型 `useSetterState`（~80 行）

- **涉及**：`AnalysisResults.tsx` `useAnalysisPageState`（~68）、`PCAPage.tsx` `usePcaPageState`（~50）、`rebalancingSensitivityUtils.ts` `useRebalSetters`（52）、`hooks/useFactorRegressionState.ts`（~40）。`monteCarloUtils.ts` 的 `useMcSetters` 已是此模式但未复用。
- **重写方案**：

```ts
export function useSetterState<T extends object>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const setters = Object.fromEntries(
    Object.keys(initial).map((k) => [
      `set${k[0].toUpperCase()}${k.slice(1)}`,
      (v: unknown) => setState((p) => ({ ...p, [k]: v })),
    ]),
  ) as { [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void };
  return { ...state, ...setters };
}
// useRebalSetters: 52 行 → 8 行（仅保留字段初值）
export function useRebalSetters() {
  return useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    adjustForInflation: false,
    smoothingFactor: 0.5,
    thresholdPercent: 5,
    minBalance: 0,
    rebalanceOn: 'anniversary',
    simulateWithdrawal: false,
    withdrawal: 0,
  });
}
```

- **为什么能省**：~40 个字段的 `useState`+setter 样板（4 行/字段）→ 每字段 0 行；monteCarloUtils 的 useMcSetters 改为调用它，删重复实现。
- **风险**：中。`Capitalize` 模板字面量类型需一次到位；返回值展开会改变 hook 引用，各页面直接消费无 memo 依赖该对象本身；`useAnalysisPageState` 的 tickers 仍用 `useListState`，混用需保留。

### 7. k8s 五个 Deployment → base 模板 + 差异 patch（258 → ~180，省 ~80 / 31%）

- **现状问题**：已亲读 `api-deployment.yaml`（46 行）。api/engine-go/data-fetcher 三个 Deployment 的 `terminationGracePeriodSeconds: 35`、startup/liveness/readiness 三 probe、resources 完全同款，仅 name/image/port/probe path 不同；worker、canary 是变体（exec liveness、grace 60、istio 附属）。
- **重写方案**（Kustomize base + patchesStrategicMerge，注意与已完成的 labels transformer 不冲突）：

```yaml
# k8s/base/deployment.yaml —— 唯一模板
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 2
  template:
    spec:
      terminationGracePeriodSeconds: 35
      containers:
        - name: app
          image: backtest-platform/app:v1.0.0
          resources:
            { requests: { memory: '256Mi', cpu: '0.5' }, limits: { memory: '1Gi', cpu: '1' } }
          startupProbe:
            { httpGet: { path: /health, port: 5001 }, failureThreshold: 30, periodSeconds: 2 }
          livenessProbe:
            {
              httpGet: { path: /health, port: 5001 },
              initialDelaySeconds: 10,
              periodSeconds: 15,
              timeoutSeconds: 5,
            }
          readinessProbe:
            {
              httpGet: { path: /ready, port: 5001 },
              initialDelaySeconds: 5,
              periodSeconds: 10,
              timeoutSeconds: 3,
            }
# api/patches: 仅 containers name/image/ports 差异（~6 行）
```

- **为什么能省**：5 文件 ~45 行公共体（probe×3+grace+resources）各留 1 份；canary 只抽 Deployment 部分，istio VirtualService/DestinationRule 不动。
- **风险**：中。worker 的 exec liveness + grace 60 + 无 startupProbe 需独立 patch 覆盖；改后必须 `kubectl kustomize` 全量 build 验证（C-007 兜底）。

### 8. `AnnualReturnChart.tsx` 三个手写表格 → `SimpleTable`（252 → ~185，省 ~67 / 27%）

- **现状问题**：已亲读。`AnnualTableHeader`（24 行）+ `AnnualTableBody`（47 行）+ `AnnualReturnTable`（22 行）手写 `<table>`，`PortfolioSummaryStats`（~48 行）是第二份手写表格（zebra 用 `ri % 2 === 1`，与 `SimpleTable` 的 `idx % 2 === 1` 一致）；`SUMMARY_ROWS` 已数据驱动。
- **重写方案**：

```tsx
function AnnualReturnTable({
  portfolios,
  data,
}: {
  portfolios: PortfolioResult[];
  data: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<Record<string, unknown>>[] = [
    { key: 'year', label: 'Year', render: (r) => r.year as number },
    ...portfolios.map((p, idx) => ({
      key: p.name,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </span>
      ),
      align: 'right' as const,
      render: (r) => {
        const v = r[p.name] as number | undefined;
        return v !== undefined ? (
          <span className={v < 0 ? 'text-neg' : undefined}>{v.toFixed(2)}%</span>
        ) : (
          '-'
        );
      },
    })),
  ];
  return (
    <div style={{ marginTop: '20px' }}>
      <div className="text-label font-semibold mb-2">{t('Annual Returns Table')}</div>
      <SimpleTable columns={columns} data={[...data].reverse()} rowKey={(r) => String(r.year)} />
    </div>
  );
}
```

- **为什么能省**：~93 + ~48 行表格样板（th/td/zebra/border）→ 2 组列配置 ~45 行。
- **风险**：低。SimpleTable 表头是 uppercase（组合名表头视觉变大写）；无 data-testid 依赖（已 grep）；右对齐/等宽字体由 SimpleTable 自带。

### 9. `jwt-auth.test.ts` + `token-refresh.test.ts` 共享 token 工厂（832 → ~770，省 ~60 / 7%）

- **现状问题**：两文件已共享 `jwtAuth.shared.ts`，但各自仍有 ~40 行"构造过期 token"样板（`signRsa` + fake timers + `expireStoredToken`），401 断言包装与 `routeAssertions.ts` 的 `expectError` 重叠。
- **重写方案**（`authFixtures.ts` 新增 + routeAssertions 收拢）：

```ts
export function makeExpiredToken(payload: JwtPayload, ttlMs = -1000) {
  vi.useFakeTimers();
  const token = signRsa({
    ...payload,
    iat: Math.floor(Date.now() / 1000) + Math.floor(ttlMs / 1000) - 10,
  });
  vi.useRealTimers();
  return token;
}
// 两文件各删本地 expiredTokenByFakeTimers / 过期 token 构造 + expectJwtAuth401
```

- **为什么能省**：两个文件各删 ~30-40 行 token 构造 + 重复 401 断言。
- **风险**：中。fake timers 与 redis TTL 交互是时序敏感，合并必须保留 `vi.useRealTimers()` 恢复顺序；对抗性用例（超长 token/Redis 降级）断言不得丢失。

### 10. `billing-service.test.ts` 配额用例表驱动（380 → ~320，省 ~60 / 16%）

- **现状问题**：plan→quota 三个 describe（free/pro/enterprise）各含 3-4 个同构用例（`dbMocks.query.mockResolvedValueOnce({rows:[{plan}]})` + 断言配额数字）；文件头部 14 行解释 vi.hoisted 的 "what" 注释；`callSql/callArgs` helper 与 auditStorageService.test.ts 同名同实现。
- **重写方案**：

```ts
it.each([
  ['free', { jobs: 1, mcs: 1, teamSeats: 1 }],
  ['pro', { jobs: 10, mcs: 5, teamSeats: 3 }],
  ['enterprise', { jobs: 100, mcs: 100, teamSeats: 100 }],
] as const)('%s 计划配额正确', async (plan, expected) => {
  dbMocks.query.mockResolvedValueOnce({ rows: [{ plan }] });
  expect(await getPlanQuotas(ORG)).toEqual(expected);
});
```

- **为什么能省**：14 行注释 + 3 组同构 describe 各 ~25 行 → 1 张数据表；`callSql` 提 tests/helpers 共享。
- **风险**：低。quota exceeded 对抗性断言独立保留。

### 11. `data-service.test.ts` ticker 类型×四态矩阵（532 → ~470，省 ~60 / 11%）

- **现状问题**：fetchHistoryData 对 stock/etf/fund/crypto 各重复 success/degraded/notFound/error 四态用例，每例 `setupValid()` + 三段断言；`dataService.shared.ts` 已抽走 mock 装配但用例层重复。
- **重写方案**：

```ts
it.each([
  ['stock', 'AAPL', false, 'rows', 200],
  ['etf', 'VTI', false, 'rows', 200],
  ['fund', 'VFIAX', true, 'rows', 200],
  ['crypto', 'BTC', false, null, 404],
] as const)('%s %s degraded=%s', async (_type, ticker, degraded, rows, expectedStatus) => {
  setupValid({ degraded, rows: rows === 'rows' ? rowsFixture : null });
  const result = await fetchHistoryData(ticker);
  expect(result).toMatchObject({ status: expectedStatus, ...(degraded && { degraded: true }) });
});
```

- **为什么能省**：~20 个同构用例折叠为 1 张表。
- **风险**：低-中。仅合并返回值形状一致的 ticker 类型；crypto/fund 若字段不同则保留独立用例。

### 12. `worker.test.ts` mock 堆叠 → `tests/helpers/workerMocks.ts`（358 → ~300，省 ~60 / 17%）

- **现状问题**：文件顶部 ~18 个 `vi.mock`（~60 行），logger/config/redisClient/metrics/engineClient 的 mock 与路由/服务测试完全重复。
- **重写方案**：新建 `workerMocks.ts` 用 `vi.hoisted` 容器集中全部 worker 依赖 mock（照抄 `backtestRoutesFixtures` 已验证模式），测试文件只留业务断言。
- **为什么能省**：60 行 mock 堆叠 → 1 个共享文件 + 短路径导入。
- **风险**：中。模块加载时序（hoisted 依赖）敏感，迁移必须整块移动防 TDZ；`EngineUnavailableErrorStub` 路径变化需全量 grep。

### 13. `GoalOptimizerResults.tsx` + `GoalOptimizerParams.tsx` 删除透传 wrapper（301 → ~250，省 ~55 / 18%）

- **现状问题**：`GOParamsWrapper`（27 行）仅为把 panel 的 19 个平铺 props 转成 state 而存在；`GoalParamsProps` 接口 22 行；GoParamsPanel 直接收 `state` 即可。
- **重写方案**：

```tsx
export function GoalOptimizerParamsPanel({ state }: { state: GOState }) {
  const {
    targetAmount,
    initialAmount,
    years,
    assets,
    isLoading,
    error,
    setTargetAmount,
    setInitialAmount,
    setYears,
    updateAsset,
    addAsset,
    removeAsset,
    runOptimization,
  } = state;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('goalOptimizer.targetAmount')}
          prefix="$"
          value={targetAmount}
          onChange={setTargetAmount}
        />
        <Field
          label={t('goalOptimizer.timeHorizon')}
          suffix="yrs"
          value={years}
          onChange={setYears}
        />
      </div>
      <AssetRows
        assets={assets}
        onUpdate={updateAsset}
        onAdd={addAsset}
        onRemove={removeAsset}
        showTotal
      />
      <ErrorBanner error={error} onRetry={runOptimization} />
    </div>
  );
}
// ComputeToolShell 的 params 槽改为直接传 (state: GOState) => <Panel state={state} />
```

- **为什么能省**：删 27 行 wrapper + 22 行接口 + ~20 行 props 透传；`t` 兜底删除。
- **风险**：低。`GOState` 已在 goalOptimizerUtils 定义；与第 5 项 AssetRows 天然协同。

### 14. `StatisticsTable.tsx` 主表 → `SortableTable` + 顺带合一 `tables.tsx`（403 + 173 → ~330 + 135，省 ~55 / 10%）

- **现状问题**：已亲读两文件。`StatisticsTable` 主组件（L86-244）手写完整排序状态机（sortKey/sortDir/表头点击），而 `SortableTable`（tables.tsx L102-173）已有完全相同的逻辑；`ExtendedMetricsTable` 已经用 `SimpleTable`。同时 `SimpleTable`（L18-71）与 `SortableTable`（L102-173）是两个重复的表壳。
- **重写方案**：

```tsx
// tables.tsx: SortableTable 增加 stickyLeft?/colorize?/tdTestId? 三可选 prop（~12 行），并与 SimpleTable 合一为带可选排序的 Table
<SortableTable
  columns={visibleColumns.map((col) => ({
    key: col.key,
    label: t(col.label),
    stickyLeft: col.key === 'name',
    tdTestId: (r) => STAT_KEY_TO_TESTID[col.key],
    sortValue: (p) => (col.format === 'text' ? 0 : Number(p.stats[col.key]) || 0),
    render: (p, i) => cellContent(p, col, i),
  }))}
  data={portfolios}
  initialSortDir="desc"
/>
// 保留 ~35 行标题/列显隐 DropdownMenu/导出/展开
```

- **为什么能省**：~100 行 thead/tbody/排序 JSX → 1 个调用 + 17 列映射；两套表壳合一再省 ~40。
- **风险**：中。sticky 列、colorize 单元格、`data-testid`（`STAT_KEY_TO_TESTID` 有 e2e 引用）必须由 SortableTable 新 prop 精确还原；表头样式从自定义变 uppercase 是视觉微调。

### 15. `AnalysisResults.tsx` tab 壳 + 指标表收敛（326 → ~270，省 ~55 / 17%）

- **现状问题**：7 个 `TabsContent` + Suspense 块全同构（~15 行 × 7）；`StatsTable/StatsTableHeader`（~50 行）与 ConclusionSection/MonteCarloSummary/ResultsPanel 的"指标行 × 序列列"表格重复。
- **重写方案**：

```tsx
const TAB_RENDER: Record<string, (r: AnalysisResult) => ReactNode> = {
  summary: (r) => <OverviewCharts results={r} />,
  telltale: (r) => <TelltaleChart results={r} />,
  drawdown: (r) => <DrawdownChart results={r} />,
  rolling: (r) => <RollingChart results={r} />,
};
<TabsList>
  {TABS.map((tb) => (
    <TabsTrigger key={tb.key} value={tb.key}>
      {t(tb.labelKey)}
    </TabsTrigger>
  ))}
</TabsList>;
{
  TABS.map((tb) => (
    <TabsContent key={tb.key} value={tb.key} className="pt-4">
      <Suspense fallback={<TabFallback />}>{TAB_RENDER[tb.key](results)}</Suspense>
    </TabsContent>
  ));
}
```

- **为什么能省**：7 个 TabsContent 样板 ~60 行 → 3 行循环 + 1 个 Record；StatsTable 50 行 → 共享 `MetricsSeriesTable` 3 行调用。
- **风险**：中。lazy import 保留在 Record 内；列对齐样式以共享组件为准需快照对比。

### 16. `BaseCalculatorUI.tsx` 图表 + 字段收敛（317 → ~265，省 ~55 / 17%）

- **现状问题**：`TwoFundChart`（30 行）是完整 recharts ScatterChart 样板（与 PCAPage/ResultsPanel 重复）；5 个 `<Field>` 手写重复 JSX；frontier 计算函数与 backtestOptimizerUtils 的 `computeTwoFundFrontier` 是拷贝。
- **重写方案**：

```tsx
// 5 个 Field → 数组
const fields = [
  ['Asset A CAGR', cagrA, setCagrA, '%'],
  ['Asset A Volatility', volA, setVolA, '%'],
  ['Asset B CAGR', cagrB, setCagrB, '%'],
  ['Asset B Volatility', volB, setVolB, '%'],
] as const;
<div className="grid grid-cols-2 gap-3">
  {fields.map(([label, value, set, suffix]) => (
    <Field key={label} label={t(label)} value={value} onChange={set} suffix={suffix} />
  ))}
</div>;
```

- **为什么能省**：私有 Chart 30 行 → 复用 XYScatterChart（见 #19）；25 行字段 JSX → 4 行；重复 frontier 计算删除。
- **风险**：中。两个 frontier 实现需确认数值一致（快照测试护）；XYScatterChart 需先落地（#19）。

### 17. `TacticalSignalEditor.tsx` 后缀输入 + 6 handler 收敛（321 → ~270，省 ~50 / 16%）

- **现状问题**：3 处 `relative + Input + 后缀` 各自手写；add/remove/update 6 个 handler 按信号类别对称重复；`selectedName`/`nameError` 的 select 逻辑 ~20 行可从 options 查表。
- **重写方案**：

```tsx
function SuffixedInput({ suffix, className, ...props }: InputProps & { suffix: ReactNode }) {
  return (
    <div className="relative">
      <Input {...props} className={cn(className, 'pr-10')} />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
        {suffix}
      </span>
    </div>
  );
}
const removeItem = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);
const addItem = <T,>(list: T[], make: () => T) => [...list, make()];
const selected = options.find((o) => o.name === selectedName);
const nameError = !selected ? t('...invalidSignal') : null;
```

- **为什么能省**：3 个后缀输入 ~15 行 → 1 个组件；6 个 handler ~40 行 → 2 个泛型 helper + 每处 1 行；select 逻辑 20 行 → 2 行。
- **风险**：中。add 默认值、remove 限制语义在调用处参数保留。

### 18. `schemas/backtest.test.ts` mutSuite 断言矩阵（303 → ~255，省 ~50 / 17%）

- **现状问题**：每个 schema（portfolio/params/optimizer/letf）的校验失败用例用 set/del/mutSuite 逐一书写，"必填缺失/类型错误"模式在每个 schema 重复；`schemaMutators.ts` 已有 set/del。
- **重写方案**：

```ts
const REQUIRED_FIELD_CASES = [
  ['portfolio', 'name', 'missing', 'REQUIRED'],
  ['params', 'startDate', 'bad-type', 'INVALID_TYPE'],
] as const;
it.each(REQUIRED_FIELD_CASES)('%s 缺少/错误 %s 应报 %s', (schema, field, mode, code) => {
  const result = mutSuite(schema, [mode === 'missing' ? del(field) : set(field, 123)]);
  expect(result.success).toBe(false);
  expect(result.error.issues[0].code).toBe(code);
});
```

- **为什么能省**：~30 个逐条用例 → 2-3 张数据表。
- **风险**：低-中。zod v4 错误 code 各 schema 需先验证一致，不一致则降级只断言 `success === false`。

### 19. 三个散点图 → `XYScatterChart` 跨文件（~50 行）

- **涉及**：`PCAPage.tsx` PCAScatterChart（~43）、`ResultsPanel.tsx` ScatterTab（~55）、`OptimizerResults.tsx` FrontierChart（~58）。
- **现状问题**：3 处 `ResponsiveContainer + ScatterChart + CartesianGrid + XAxis/YAxis(number) + Tooltip + ZAxis + Scatter` 全量样板，仅 dataKey 与 referenceLine/图例不同；`CHART_TOOLTIP_STYLE`/`AXIS_TICK_STYLE` 各文件重复定义。
- **重写方案**：

```tsx
export function XYScatterChart({
  data,
  xKey,
  yKey,
  xName,
  yName,
  height = 300,
  extra,
}: {
  data: unknown[];
  xKey: string;
  yKey: string;
  xName: string;
  yName: string;
  height?: number;
  extra?: ReactNode;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          type="number"
          dataKey={xKey}
          name={xName}
          tick={AXIS_TICK_STYLE}
          label={{
            value: xName,
            position: 'insideBottom',
            offset: -5,
            fontSize: 12,
            fill: CHART_TEXT_COLOR,
          }}
        />
        <YAxis
          type="number"
          dataKey={yKey}
          name={yName}
          tick={AXIS_TICK_STYLE}
          label={{
            value: yName,
            angle: -90,
            position: 'insideLeft',
            offset: 10,
            fontSize: 12,
            fill: CHART_TEXT_COLOR,
          }}
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <ZAxis range={[36, 36]} />
        <Scatter data={data} fill={CHART_COLORS[0]} fillOpacity={0.6} />
        {extra}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
```

- **为什么能省**：3 处 ~45 行样板 → 1 个 ~20 行组件 + 每处 2 行；图表常量统一。
- **风险**：中。FrontierChart 的 ReferenceLine、ScatterTab 的按时间着色 Cell 用 `extra`/children 槽保留；Y 轴 percent formatter 参数化防数字漂移。

### 20. `data-fetcher/internal/handlers` 响应样板 → 泛型 `handle[T]`（335 → ~285，省 ~50 / 15%）

- **现状问题**：`data.go`（225）+ `baostock.go`（110）每个 handler 都是"取参数 → 调 service → `if err { fail }` → `c.JSON(ok(data, degraded))`"的 5-8 行样板。
- **重写方案**：

```go
func handle[T any](svc func(string) (T, error), param func(*gin.Context) string, degraded bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		data, err := svc(param(c))
		if err != nil { fail(c, err); return }
		c.JSON(http.StatusOK, ok(data, degraded))
	}
}
r.GET("/search", handle(svc.Search, func(c *gin.Context) string { return c.Query("q") }, false))
r.GET("/price", handle(svc.PriceData, func(c *gin.Context) string { return c.Query("symbol") }, true))
```

- **为什么能省**：8 个 handler × 6-10 行样板 → 1 个 10 行泛型 + 每处 2 行闭包；baostock 只收敛响应序列化部分。
- **风险**：中。`degraded` 字段仅在 data service 端点（ADR-031），spec 里显式标注；baostock 的登录/请求生命周期不能套同一泛型；改后必须跑 `pnpm test:contract`。

---

## TOP 20 之外的追加清单（省行数降序，保守）

| #   | 文件/组                                             | 省行 | 方案                                                                                                               |
| --- | --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| 21  | `DataManagement.tsx`（379）                         | ~45  | 两套独立 try/catch 拉取合并为 `Promise.all` 单套；`loading/updating/saving` 派生 `busy`                            |
| 22  | `admin-routes.test.ts`（317）                       | ~40  | `createMockTickerStats`（27 行 fixture）并入 dataManageRoutesFixtures 的 `createMockStats`                         |
| 23  | `OrgMembersPage.tsx`（305）                         | ~40  | InviteForm/InvitationTable 转发 props（5 个）内联进 InviteDialog，email/role state 下沉                            |
| 24  | `health-routes.test.ts`（280）                      | ~40  | 4 个 describe 的 `/ready`+`/metrics` 鉴权矩阵（401/403 × 2）表驱动；METRICS_AUTH_TOKEN 重置收敛                    |
| 25  | `staticPages.tsx`（413）                            | ~35  | About/Limits/Upgrade 三个内容组件共用 intro+卡片网格壳（已亲读：三组件已数据驱动但壳重复，非 83 行）               |
| 26  | `CorrelationHeatmapChart.tsx`（328）                | ~35  | RollingCorrelationLineChart（48 行）改用 `TimeSeriesLineChart`（+referenceLines prop）；NoDataCard/EmptyState 合一 |
| 27  | `config/index.test.ts`（351）                       | ~35  | `CFG_KEYS` 从 `Object.keys(config)` 派生；NODE_ENV 分支用例表驱动                                                  |
| 28  | `auth-routes.test.ts`（447）                        | ~35  | 登录失败矩阵（wrong-password/unknown/locked/disabled）表驱动                                                       |
| 29  | `svgChartParts.tsx`（408）                          | ~30  | `XAxisTicks`（41 行）并入 `SvgAxis`（tick 加 `show?`/`maxLabelLen?`，+3 行）                                       |
| 30  | `universe_builder.go`（270）                        | ~30  | 每市场 fetch 循环 → 市场 spec 表 + 单一 build 循环                                                                 |
| 31  | `.github/workflows`（168）                          | ~30  | 5 job 重复的 checkout+pnpm/setup-node+install 4 步 → 本地 composite action                                         |
| 32  | `persistence-routes.test.ts`（269）                 | ~30  | `res` 手工分组对象（19 行）从 `mocks.repos` 自动派生                                                               |
| 33  | `data-cache-service.test.ts`（241）                 | ~30  | 37 行内存 Redis stub → mockFactories 的 `createMemoryRedisStub()` 共享                                             |
| 34  | `apiKeyRepo.ts`（236）                              | ~25  | create/list/revoke 三对组织密钥 vs 平台 break-glass 密钥 CRUD → 单函数 + `orgId/isPlatformAdmin` 互斥参数          |
| 35  | `tactical.go`（238）                                | ~25  | `equalWeights`/`weightsFromMap` helper 替代 3-4 处等权/归一化重复块（已亲读核实 L56/L118-123）                     |
| 36  | `TimeSeriesLineChart.tsx`（206）                    | ~25  | 本地 renderXAxis/renderYAxis/Tooltip 改用 sharedChartContent 的 ChartXAxis/ChartYAxis/ChartTooltip                 |
| 37  | `billingRoutes.ts`（213）                           | ~20  | `/checkout`+`/portal` 内联样板 → `billingActionRoute` 工厂                                                         |
| 38  | `GrowthChart.tsx`+`drawdownCharts.tsx`（274+199）   | ~20  | 两处手写 date 合并 Map → 复用 `mergePortfolioSeries`；`toggleInSet` 导出复用                                       |
| 39  | `solvers.go`（198）                                 | ~20  | `tangentPortfolio`/`closedFormMinVolatility` 对称闭式解 → `normalizedSol`（σ⁻¹v 归一化）                           |
| 40  | `monteCarloUtils.ts`（417）                         | ~15  | 两个直方图构建器合一（DIST_METRICS 注册表已存在，仅直方图部分；binLabel 查表已被 plan.md #16 覆盖不重复）          |
| 41  | `analysis.tsx`（347）                               | ~15  | GrowthChart 改用 TimeSeriesLineChart（其余 HeatmapTable/exportData 已被 plan.md #10 覆盖）                         |
| 42  | `dataRoutes.ts`+`platformRoutes.ts`（402）          | ~12  | 3 处手写 TTL 缓存 → `utils/ttlCache.ts` 工厂                                                                       |
| 43  | `backtestStore.ts`+`dataEngineCards.tsx`（323+322） | ~12  | `nextCounter` helper 替代 3 处 `portfolioCounter+1`；coverageBase 公式合一                                         |
| 44  | `indicators.go`（147）                              | ~10  | `nanSeries(n)` helper 替代 5 处 `make+for+nan` 初始化                                                              |
| 45  | `backtest-helpers.ts`+服务（964）                   | ~10  | `prepareEnginePriceData` 组合 fetch+warnings+degraded 脚手架（4 服务重复 ~36 行）                                  |
| 46  | `metrics.ts`（302）                                 | ~10  | 6 组显式 `gauge(...)` 样板 → `GAUGE_DEFS` 表                                                                       |
| 47  | `worker.ts`（216）                                  | ~8   | portfolio 特判分支并入 `JOB_HANDLERS`（`persist:false` 保持不落库语义）                                            |

追加清单合计：**~770 行**。

---

## 总量估计（保守）

| 分组                                                              | 省行（保守）     | 占当前    |
| ----------------------------------------------------------------- | ---------------- | --------- |
| TOP 20                                                            | ~1,420           | 1.2%      |
| 追加 21-47                                                        | ~770             | 0.6%      |
| **代码级真实可重写空间**                                          | **~2,190**       | **~1.8%** |
| 空行压缩（安全，全仓 ~5,378 空行的近半）                          | ~2,000           | 1.7%      |
| 注释削减（删 "what" 注释，保留 "why"）                            | ~800-1,500       | 0.7-1.2%  |
| 结构性合并（页面 tab 化/4 params 面板 FieldRenderer 等，UX 变更） | ~2,000-3,000     | 1.7-2.5%  |
| **合计（含结构性，乐观上界）**                                    | **~7,000-8,700** | **~6-7%** |

**结论**：v5 批次真实代码重写空间约 **2,200 行（1.8%）**，比 plan.md 的 v4 估算（~450）高约 4 倍——差距来自 v4 只覆盖了 18 个大文件，而本批覆盖了 tests 区域与 data-fetcher/k8s/scripts。但**"从当前 120,564 再减 20%（→96,500）"在"不删功能、不砍测试覆盖率、不牺牲文档"的约束下不可达**：代码级 + 空行注释 + 安全结构合并合计乐观 ~6-7%，距 20% 仍差 ~13-14% 需要删功能/删测试用例/合并页面（见下）。

**两种口径澄清**：若 20% 指基线 179,541 的累计减量，**已达成（-32.9%）**，本批 + 结构性路径可安全推进到 ~35%。若指当前再减 20%，必须走结构性裁剪。

---

## 结构性裁剪路径（达成 ~20% 的唯二现实选项，均违背 AGENTS.md 约束）

| 选项                                                                 | 估省         | 代价         | 违背约束                                       |
| -------------------------------------------------------------------- | ------------ | ------------ | ---------------------------------------------- |
| 测试用例裁剪（每个 schema/路由删 ~30% 边缘用例，表驱动已保留主场景） | ~3,000-5,000 | 覆盖率下降   | AGENTS.md"保留测试覆盖率/每唯一行为至少一断言" |
| 合并 3 个信号页面为 1 个 mode selector + tactical+grid 合并          | ~2,500       | UX 变更      | "不删功能、不改行为"                           |
| i18n zh-CN common.json（1007 行）继续展平/去重 key                   | ~500         | 翻译维护     | 无                                             |
| docs 41 文件 → 20 核心文件（ADR 归档）                               | ~400-800     | 架构记录丢失 | "文档完整性"                                   |
| 删零消费占位页（chart-benchmark/portfolio-comparison）               | ~60-120      | 开发工具丢失 | "不删功能"                                     |
| YAML 流式折叠（k8s/docker-compose 已有 anchors）                     | ~300-500     | 可读性       | AGENTS.md"YAML 流式折叠牺牲可读性不允许"       |

**结构性路径乐观合计 ~7,000-10,000 行，加代码级 ~2,200 + 空行/注释 ~3,000 = ~12,000-15,000（10-12%）。20% 目标（-24,000）在保功能前提下不存在**——除非整体功能范围缩小（如删除多市场支持、退役某个数据源）。

---

## 确认无重写空间的文件（本人逐一亲读，非转述）

- **`tests/unit/routes/analysisRoutes.test.ts`**（701 行）：已亲读全文件。`describe.each(ANALYSIS_CASES)` + `it.each`（validation/notFound/extra）+ setupServer helper 已是全仓最紧测试形态；额外空间仅剩每 describe 6 行生命周期样板（并入 #2 harness，~40 行）。代理声称 -180 不成立。
- **`packages/frontend/src/pages/monte-carlo/monteCarloUtils.ts`**（417 行）：已亲读关键区。`DIST_METRICS` 单一注册表 + `metricLabels`/`METRIC_FORMAT` 派生导出已到位，`useMcSetters` 已泛型；仅剩直方图合一 ~15 行（#40）。与 plan.md 判定一致。
- **`tests/helpers/expressApp.ts`**（77 行）：已亲读。start/close/reqJson/postJson 已是最小形态，`useRouteHarness` 应加在此处而非重写它。
- **`data-fetcher/internal/provider/registry.go`**（116 行）：已亲读。表驱动注册 + `FetchWithFallback` + `NewProviderBreaker` 已是通用基础设施，无压缩空间。
- **`packages/frontend/src/pages/backtest/backtestOptimizerComponents.tsx`**（434 行）：已亲读。RANGE_DEFS/CONSTRAINT_DEFS/DATE_FIELDS/OBJECTIVE_OPTIONS 已数据驱动，ParamsPanel/ParamCard 已复用；剩余仅为资产行（→#5）与 GrowthComparisonChart 的 2 Line→map（~10 行）。代理声称 -174 不成立。
- **`engine-go/internal/engine/tactical/tactical.go`**（238 行）：已亲读前 130 行。`accumulateSignalWeights`/`normalizeWeights` 已是共享 helper；等权块可再提一 helper（#35，~25 行），核心聚合逻辑（rank/risk_parity）不可压缩。
- **`data-fetcher/internal/yfinance/yfinance.go`**（171 行）：已亲读。解析函数 + 响应结构 ~100 行不可压缩；可压的 ~70 行骨架已计入 #1。

**经 plan.md v4 亲读确认、本批复核一致的无空间文件**：`engine-go/internal/engine/statisticsMetrics.go`（489，40+ 独立指标公式）、`authRoutes.ts`/`jwtAuth.ts`（安全关键流程）、`handlers.go`（bindCompute 泛型）、`docker-compose.yml`（anchors 已用）、`migrations/001_initial_schema.sql`（DDL 不可压缩）、`vite.config.ts`。

---

## 最高性价比开工顺序（互相独立，可并行）

1. **#4 submitQueueJob 工厂 + #34 apiKeyRepo 合并**（backend，安全边界已亲读核实，~105 行）
2. **#1 data-fetcher provider 泛型 + #20 handlers 泛型**（Go，~210 行，`go test ./...` 兜底）
3. **#8 AnnualReturnChart + #14 StatisticsTable + tables.tsx 合一**（frontend 表格收敛，~120 行）
4. **#2 useRouteHarness + #9/#10/#11/#12 测试表驱动**（tests，~300 行，每唯一场景保一个断言）
5. **#7 k8s base 模板 + #3 verify 表驱动**（配置/脚本，~170 行）

每项完成后跑对应验证：`pnpm exec tsc --noEmit` / `pnpm exec prettier --write` / `go test ./...` / `pnpm exec vitest run tests/unit` / `pnpm exec vitest run tests/contract`（动了路由/OpenAPI 时）。
