/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any -- 中文指标名映射值经 fmt 处理非直接渲染；动态 form patch 需 any */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REBALANCE_FREQUENCY_OPTIONS, REBALANCE_LABELS } from '@backtest/shared';
import type {
  BacktestOptimizerObjective as Objective,
  BestResultItem,
  OptimizeResultItem,
  RebalanceFrequency,
} from '@backtest/shared';
import { getPortfolioColor as portColor } from '@/lib/chart-theme.js';
import * as PL from '../../components/params/paramsLayout.js';
import * as UI from '@/components/ui/uiComponents';
import SinglePortfolioEditor from '@/components/PortfolioEditor.js';
import { RunButton } from '@/components/form/sharedFields';
import { useSettingsStore } from '@/store/settingsStore';
import { StatCard } from '@/components/cards.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { SortableTable, type TableColumn } from '../../components/tables.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import i18n from '@/i18n/index.js';
import { fmtAmount, fmtNum, fmtPct } from '@/utils/format';
import { apiFetch } from '@/utils/apiClient';
import { extractApiErrorDetail } from '@/store/backtestHelpers.js';
import { pollJobStatus } from '@/store/backtestStore.js';
import { useAssetList } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
type BacktestOptimizerState = any;
const h2Cls = 'mb-3 mt-6 text-body font-semibold text-fg';
const capCls = 'mb-1.5 text-caption font-medium text-fg-secondary';
const symCls = 'text-body text-fg-tertiary font-mono shrink-0';
const numProps = { type: 'number', className: 'font-mono tabular-nums' } as const;
const PG = PL.ParamGroup;
const freqLabel = (f: any, v?: number) =>
  f === 'threshold'
    ? i18n.t('Threshold ({{value}}%)', { value: v })
    : i18n.t(REBALANCE_LABELS[f as RebalanceFrequency]) || f;
const normAsset = (x: any) => ({ ticker: normalizeTicker(x.ticker), weight: +x.weight || 0 });
const rng = (a: string, b: string, c: string) => ({ min: +a, max: +b, step: +c });
const col = (
  k: keyof OptimizeResultItem,
  l: string,
  f: (v: number) => string,
): TableColumn<OptimizeResultItem> => ({
  key: k,
  label: l,
  sortValue: (r) => r[k] as number,
  render: (r) => f(r[k] as number),
});
const COLS: TableColumn<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: i18n.t('Rebalancing Frequency'),
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) => freqLabel(r.rebalanceFrequency, r.rebalanceThreshold),
  },
  {
    key: 'rebalanceThreshold',
    label: i18n.t('Threshold'),
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '-'),
  },
  col('initialCapital', i18n.t('Initial Capital'), fmtAmount),
  col('cagr', i18n.t('stats.cagr'), fmtPct),
  col('maxDrawdown', i18n.t('Max Drawdown'), fmtPct),
  col('stdev', i18n.t('Volatility'), fmtPct),
  col('sharpe', i18n.t('Sharpe'), fmtNum),
  col('sortino', 'Sortino', fmtNum),
  col('calmar', 'Calmar', fmtNum),
];
const DEF_FORM: any = {
  thrMin: '5',
  thrMax: '20',
  thrStep: '5',
  capMin: '10000',
  capMax: '10000',
  capStep: '1000',
  objective: 'maxSharpe',
  enableMaxDD: false,
  maxDD: '20',
  enableMinCagr: false,
  minCagr: '5',
  startDate: DEFAULT_BACKTEST_START_DATE,
  endDate: DEFAULT_END_DATE,
  benchmarkTicker: 'VTI',
};
const EMPTY_RES: any = { isLoading: false, error: null, results: null, best: null };
const BEST_DEFS: [keyof BestResultItem, string, (v: number) => string][] = [
  ['initialCapital', '初始资金', fmtAmount],
  ['cagr', 'CAGR', fmtPct],
  ['maxDrawdown', '最大回撤', fmtPct],
  ['stdev', '波动率', fmtPct],
  ['sharpe', 'Sharpe', fmtNum],
  ['sortino', 'Sortino', fmtNum],
  ['calmar', 'Calmar', fmtNum],
];
function useOptimizerState(): BacktestOptimizerState {
  const lst = useAssetList<{ ticker: string; weight: string }>(
    [
      { ticker: 'VTI', weight: '60' },
      { ticker: 'BND', weight: '40' },
    ],
    () => ({ ticker: '', weight: '' }),
    1,
  );
  const [frequencies, setFreqs] = useState<RebalanceFrequency[]>(['quarterly']);
  const toggleFreq = (f: RebalanceFrequency) =>
    setFreqs((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  const [form, setForm] = useState<any>(DEF_FORM);
  const patchForm = (p: any) => setForm((v: any) => ({ ...v, ...p }));
  const [result, setResult] = useState<any>(EMPTY_RES);
  const patchRes = (p: any) => setResult((v: any) => ({ ...v, ...p }));
  const runOptimize = async () => {
    const v = lst.assets.filter((x: any) => x.ticker.trim());
    if (!v.length) return patchRes({ error: i18n.t('Please enter at least one ticker') });
    if (!frequencies.length)
      return patchRes({ error: i18n.t('Please select at least one rebalancing frequency') });
    patchRes({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const c: Record<string, number> = {};
      for (const [ek, vk, , , ck] of CONS_DEFS)
        if (form[ek] && form[vk] !== '') c[ck] = Number(form[vk]);
      const r = await apiFetch('/api/v1/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio: { assets: v.map(normAsset) },
          parameterSpace: {
            rebalanceFrequencies: frequencies,
            rebalanceThreshold: rng(form.thrMin, form.thrMax, form.thrStep),
            initialCapital: rng(form.capMin, form.capMax, form.capStep),
          },
          parameters: {
            startDate: form.startDate,
            endDate: form.endDate,
            benchmarkTicker: normalizeTicker(form.benchmarkTicker),
            baseCurrency: 'usd',
            adjustForInflation: false,
          },
          objective: form.objective,
          constraints: c,
        }),
      });
      const j = await r.json();
      if (!r.ok || j.success === false) throw new Error(extractApiErrorDetail(j));
      let d: any = j.data;
      if (d?.statusUrl)
        d = (await pollJobStatus(d.statusUrl, new AbortController().signal, null)).data;
      patchRes({
        results: d.results ?? [],
        best: d.best ?? null,
        benchmarkGrowth: d.benchmarkGrowth ?? null,
        totalCombos: d.totalCombinations ?? 0,
      });
    } catch (e) {
      patchRes({ error: e instanceof Error ? e.message : i18n.t('Optimization failed') });
    } finally {
      patchRes({ isLoading: false });
    }
  };
  return { ...lst, frequencies, form, patchForm, result, toggleFreq, runOptimize };
}
const OBJ_OPTS = [
  ['maxCagr', 'backtest.optimizer.maxCagr', 'cagr'],
  ['minMaxDrawdown', 'backtest.optimizer.minMaxDrawdown', 'maxDrawdown'],
  ['maxSharpe', 'backtest.optimizer.maxSharpe', 'sharpe'],
  ['maxSortino', 'backtest.optimizer.maxSortino', 'sortino'],
] as const;
const SORT_KEY = Object.fromEntries(OBJ_OPTS.map(([v, , sk]) => [v, sk] as const));
const CONS_DEFS = [
  ['enableMaxDD', 'maxDD', 'maxDrawdownConstraint', 'maxDrawdownPlaceholder', 'maxDrawdown'],
  ['enableMinCagr', 'minCagr', 'cagrConstraint', 'cagrPlaceholder', 'minCagr'],
] as const;
const RANGE_DEFS = [
  [
    'backtest.optimizer.thresholdRange',
    '',
    '%',
    '0.5',
    [
      ['Min', 'thrMin'],
      ['Max', 'thrMax'],
      ['backtest.optimizer.step', 'thrStep'],
    ],
  ],
  [
    'backtest.optimizer.capitalRange',
    '$',
    '',
    '1000',
    [
      ['Min', 'capMin'],
      ['Max', 'capMax'],
      ['backtest.optimizer.step', 'capStep'],
    ],
  ],
] as const;
const DATE_FLS = [
  ['startDate', 'Start Date', 'date'],
  ['endDate', 'End Date', 'date'],
  ['benchmarkTicker', 'backtest.optimizer.benchmarkTicker', 'text', 'benchmarkPlaceholder'],
] as const;
export function OptimizerParams({ s }: { s: BacktestOptimizerState }) {
  const { t } = useTranslation();
  return (
    <PL.ParamsPanel>
      <PG title={t('Portfolio Allocation')} info={t('Add tickers and weights for optimization')}>
        <SinglePortfolioEditor
          singleMode
          assets={s.assets.map(({ ticker, weight }: any) => ({ ticker, weight: +weight || 0 }))}
          totalWeight={s.totalWeight}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={(i: any, f: any, v: any) => s.updateAsset(i, f, String(v))}
          wrapInSection={false}
        />
      </PG>
      <ParameterSpaceSection s={s} />
      <PG title={t('Objective')} info={t('Select optimization objective and constraints')}>
        <PL.ParamRow>
          <PL.ParamCard label={t('Target')}>
            <UI.Select
              value={s.form.objective}
              onValueChange={(v: any) => s.patchForm({ objective: v as Objective })}
            >
              <UI.SelectTrigger>
                <UI.SelectValue />
              </UI.SelectTrigger>
              <UI.SelectContent>
                {OBJ_OPTS.map(([v, lk]) => (
                  <UI.SelectItem key={v} value={v}>
                    {t(lk)}
                  </UI.SelectItem>
                ))}
              </UI.SelectContent>
            </UI.Select>
          </PL.ParamCard>
        </PL.ParamRow>
        <div className="mt-3 flex flex-col gap-3">
          {CONS_DEFS.map(([ek, vk, lk, pk]) => (
            <div key={ek} className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
                <UI.Switch checked={s.form[ek]} onCheckedChange={(v) => s.patchForm({ [ek]: v })} />
                <span className="text-caption text-fg-secondary">
                  {t(`backtest.optimizer.${lk}`)}
                </span>
              </label>
              <div className="flex flex-1 items-center gap-2">
                <UI.Input
                  {...numProps}
                  step="0.1"
                  value={s.form[vk]}
                  onChange={(e) => s.patchForm({ [vk]: e.target.value })}
                  placeholder={t(`backtest.optimizer.${pk}`)}
                  disabled={!s.form[ek]}
                />
                <span className="text-caption text-fg-tertiary shrink-0">%</span>
              </div>
            </div>
          ))}
        </div>
      </PG>
      <PG title={t('Backtest Range')} info={t('Set the backtest time range for parameter search')}>
        <PL.ParamRow>
          {DATE_FLS.map(([k, lk, ty, pk]) => (
            <PL.ParamCard key={k} label={t(lk)}>
              <UI.Input
                type={ty}
                value={s.form[k]}
                onChange={(e) => s.patchForm({ [k]: e.target.value })}
                placeholder={pk ? t(`backtest.optimizer.${pk}`) : undefined}
              />
            </PL.ParamCard>
          ))}
        </PL.ParamRow>
      </PG>
      <div className="py-3">
        <RunButton
          isLoading={s.result.isLoading}
          onClick={() => void s.runOptimize()}
          label={t('Start Optimization')}
          loadingLabel={t('Optimizing...')}
        />
      </div>
    </PL.ParamsPanel>
  );
}
export function OptimizerResults({ s }: { s: BacktestOptimizerState }) {
  const { t } = useTranslation();
  const b = s.result.best;
  const m = new Map<string, any>();
  if (b?.growthCurve) {
    for (const p of b.growthCurve) m.set(p.date, { date: p.date, portfolio: p.value });
    for (const p of s.result.benchmarkGrowth ?? []) {
      const e = m.get(p.date);
      if (e) e.benchmark = p.value;
      else m.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  }
  const chartData = [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  const nm = (n: string) =>
    n === 'portfolio' ? t('Optimal Portfolio') : n === 'benchmark' ? t('Benchmark') : n;
  const bestMetrics = !b
    ? []
    : [
        { label: '再平衡频率', value: freqLabel(b.rebalanceFrequency, b.rebalanceThreshold) },
        ...BEST_DEFS.map(([k, label, f]) => ({ label, value: f(b[k] as number) })),
      ];
  const series = [
    { dataKey: 'portfolio', name: nm('portfolio'), color: portColor(0), width: 2 },
    { dataKey: 'benchmark', name: nm('benchmark'), color: portColor(1), width: 1.5, dash: '4 2' },
  ];
  return (
    <ResultsShell
      error={s.result.error}
      errorPrefix={t('Optimization failed: ')}
      isLoading={s.result.isLoading}
      hasResults={!!s.result.results}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t('Configure parameters above and click "Start Optimization" to see results')}
    >
      <div className="flex flex-col gap-4">
        {b && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-body font-semibold text-fg">{t('Optimal Portfolio')}</div>
              <span className="text-caption text-fg-tertiary">
                {t('Total Combinations', { count: s.result.totalCombos })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {bestMetrics.map(({ label, value }) => (
                <StatCard key={label} label={label} value={value} />
              ))}
            </div>
          </div>
        )}
        {chartData.length > 0 && (
          <>
            <div className={h2Cls}>{t('Growth Comparison')}</div>
            <SimpleChart
              type="line"
              data={chartData}
              height={320}
              margin={{ left: 8, right: 20, top: 5, bottom: 5 }}
              xTickFormatter={(d: any) => String(d).substring(0, 7)}
              yTickFormatter={(v: any) => fmtAmount(v)}
              tooltipFormatter={(v: any, name: string) => [fmtAmount(v), nm(name)]}
              tooltipLabelFormatter={(d: string) => d}
              showLegend
              legendFormatter={(name: string) => nm(name)}
              series={series}
            />
          </>
        )}
        <div className={h2Cls}>{t('Portfolio Comparison Table')}</div>
        {(s.result.results ?? []).length > 0 ? (
          <SortableTable
            columns={COLS}
            data={s.result.results ?? []}
            initialSortKey={SORT_KEY[s.form.objective as Objective]}
            initialSortDir="desc"
          />
        ) : (
          <TableEmpty message={t('No portfolio matches the constraints')} />
        )}
      </div>
    </ResultsShell>
  );
}
function ParameterSpaceSection({ s }: { s: BacktestOptimizerState }) {
  const { t } = useTranslation();
  const cur = useSettingsStore((x: any) => x.currency);
  const sym = cur === 'cny' ? '¥' : '$';
  return (
    <PG
      title={t('Parameter Space')}
      info={t('Set the search range for rebalance frequency and thresholds')}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className={capCls}>{t('Rebalancing Frequency')}</div>
          <div className="flex flex-wrap gap-2">
            {REBALANCE_FREQUENCY_OPTIONS.map(({ value, label }) => (
              <UI.Button
                key={value}
                variant={s.frequencies.includes(value) ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => s.toggleFreq(value)}
              >
                {t(label)}
              </UI.Button>
            ))}
          </div>
        </div>
        {RANGE_DEFS.map(([tk, pre, suf, stp, flds]) => (
          <div key={tk}>
            <div className={capCls}>{t(tk)}</div>
            <PL.ParamRow>
              {flds.map(([lk, fk]) => (
                <PL.ParamCard key={lk} label={t(lk)}>
                  <div className="flex items-center gap-2">
                    {pre && <span className={symCls}>{sym}</span>}
                    <UI.Input
                      {...numProps}
                      step={stp}
                      value={s.form[fk]}
                      onChange={(e) => s.patchForm({ [fk]: e.target.value })}
                    />
                    {suf && <span className="text-caption text-fg-tertiary shrink-0">{suf}</span>}
                  </div>
                </PL.ParamCard>
              ))}
            </PL.ParamRow>
          </div>
        ))}
      </div>
    </PG>
  );
}
const config: ComputeToolConfig<BacktestOptimizerState> = {
  titleKey: 'backtest.optimizer.pageTitle',
  seoDescKey: 'optimizer.seoDesc',
  seoFeatures: [
    {
      titleKey: 'backtest.optimizer.featureParamSpaceTitle',
      descKey: 'backtest.optimizer.featureParamSpaceDesc',
    },
    {
      titleKey: 'backtest.optimizer.featureMultiObjectiveTitle',
      descKey: 'backtest.optimizer.featureMultiObjectiveDesc',
    },
  ],
  params: ({ state }: any) => <OptimizerParams s={state} />,
  results: ({ state }: any) => <OptimizerResults s={state} />,
};
export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return <ComputeToolShell config={config} state={s} />;
}
