/* eslint-disable no-restricted-syntax -- BEST_METRIC_DEFS 中文为指标名映射，值经 fmt 处理非直接渲染 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 动态 form patch 需 any */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REBALANCE_FREQUENCY_OPTIONS, REBALANCE_LABELS } from '@backtest/shared';
import type {
  BacktestOptimizerObjective as Objective,
  BestResultItem,
  OptimizeResultItem,
  RebalanceFrequency,
} from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
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
const SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};
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
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? i18n.t('Threshold ({{value}}%)', { value: r.rebalanceThreshold })
        : i18n.t(REBALANCE_LABELS[r.rebalanceFrequency]) || r.rebalanceFrequency,
  },
  {
    key: 'rebalanceThreshold',
    label: i18n.t('Threshold'),
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '-'),
  },
  {
    key: 'initialCapital',
    label: i18n.t('Initial Capital'),
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtAmount(r.initialCapital),
  },
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
const EMPTY_RES: any = {
  isLoading: false,
  error: null,
  results: null,
  best: null,
  benchmarkGrowth: null,
  totalCombos: 0,
};
const BEST_DEFS: [keyof BestResultItem, string, (v: number) => string][] = [
  ['cagr', 'CAGR', fmtPct],
  ['maxDrawdown', '最大回撤', fmtPct],
  ['stdev', '波动率', fmtPct],
  ['sharpe', 'Sharpe', fmtNum],
  ['sortino', 'Sortino', fmtNum],
  ['calmar', 'Calmar', fmtNum],
];
function useOptimizerState(): BacktestOptimizerState {
  const {
    assets: a,
    addAsset: add,
    removeAsset: rem,
    updateAsset: upd,
  } = useAssetList<{ ticker: string; weight: string }>(
    [
      { ticker: 'VTI', weight: '60' },
      { ticker: 'BND', weight: '40' },
    ],
    () => ({ ticker: '', weight: '' }),
    1,
  );
  const [freqs, setFreqs] = useState<RebalanceFrequency[]>(['quarterly']);
  const tog = (f: RebalanceFrequency) =>
    setFreqs((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
  const [form, setForm] = useState<any>(DEF_FORM);
  const patchForm = (p: any) => setForm((v: any) => ({ ...v, ...p }));
  const [res, setRes] = useState<any>(EMPTY_RES);
  const patchRes = (p: any) => setRes((v: any) => ({ ...v, ...p }));
  const run = async () => {
    const v = a.filter((x: any) => x.ticker.trim());
    if (!v.length) return patchRes({ error: i18n.t('Please enter at least one ticker') });
    if (!freqs.length)
      return patchRes({ error: i18n.t('Please select at least one rebalancing frequency') });
    patchRes({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const c: Record<string, number> = {};
      if (form.enableMaxDD && form.maxDD !== '') c.maxDrawdown = Number(form.maxDD);
      if (form.enableMinCagr && form.minCagr !== '') c.minCagr = Number(form.minCagr);
      const body = {
        portfolio: {
          assets: v.map((x: any) => ({
            ticker: normalizeTicker(x.ticker),
            weight: Number(x.weight) || 0,
          })),
        },
        parameterSpace: {
          rebalanceFrequencies: freqs,
          rebalanceThreshold: {
            min: Number(form.thrMin),
            max: Number(form.thrMax),
            step: Number(form.thrStep),
          },
          initialCapital: {
            min: Number(form.capMin),
            max: Number(form.capMax),
            step: Number(form.capStep),
          },
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
      };
      const r = await apiFetch('/api/v1/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || j.success === false) throw new Error(extractApiErrorDetail(j));
      const d = (
        j.data?.statusUrl
          ? (await pollJobStatus(j.data.statusUrl, new AbortController().signal, null)).data
          : j.data
      ) as any;
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
  return {
    assets: a,
    frequencies: freqs,
    form,
    patchForm,
    result: res,
    addAsset: add,
    removeAsset: rem,
    updateAsset: upd,
    toggleFreq: tog,
    runOptimize: run,
  };
}
const OBJ_OPTS = [
  { value: 'maxCagr', labelKey: 'backtest.optimizer.maxCagr' },
  { value: 'minMaxDrawdown', labelKey: 'backtest.optimizer.minMaxDrawdown' },
  { value: 'maxSharpe', labelKey: 'backtest.optimizer.maxSharpe' },
  { value: 'maxSortino', labelKey: 'backtest.optimizer.maxSortino' },
] as const;
const CONS_DEFS = [
  ['enableMaxDD', 'maxDD', 'maxDrawdownConstraint', 'maxDrawdownPlaceholder'],
  ['enableMinCagr', 'minCagr', 'cagrConstraint', 'cagrPlaceholder'],
] as const;
const RANGE_DEFS = [
  {
    titleKey: 'backtest.optimizer.thresholdRange',
    suffix: '%',
    step: '0.5',
    fields: [
      ['Min', 'thrMin'],
      ['Max', 'thrMax'],
      ['backtest.optimizer.step', 'thrStep'],
    ],
  },
  {
    titleKey: 'backtest.optimizer.capitalRange',
    prefix: '$',
    step: '1000',
    fields: [
      ['Min', 'capMin'],
      ['Max', 'capMax'],
      ['backtest.optimizer.step', 'capStep'],
    ],
  },
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
      <PL.ParamGroup
        title={t('Portfolio Allocation')}
        info={t('Add tickers and weights for optimization')}
      >
        <SinglePortfolioEditor
          singleMode
          assets={s.assets.map(({ ticker, weight }: any) => ({
            ticker,
            weight: Number(weight) || 0,
          }))}
          totalWeight={s.assets.reduce((sum: number, x: any) => sum + (Number(x.weight) || 0), 0)}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={(i: any, f: any, v: any) => s.updateAsset(i, f, String(v))}
          wrapInSection={false}
        />
      </PL.ParamGroup>
      <ParameterSpaceSection s={s} />
      <PL.ParamGroup
        title={t('Objective')}
        info={t('Select optimization objective and constraints')}
      >
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
                {OBJ_OPTS.map((o: any) => (
                  <UI.SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </UI.SelectItem>
                ))}
              </UI.SelectContent>
            </UI.Select>
          </PL.ParamCard>
        </PL.ParamRow>
        <div className="mt-3 flex flex-col gap-3">
          {CONS_DEFS.map(([ek, vk, lk, pk]: any) => (
            <div key={ek} className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
                <UI.Switch
                  checked={s.form[ek] as boolean}
                  onCheckedChange={(v: any) => s.patchForm({ [ek]: v } as any)}
                />
                <span className="text-caption text-fg-secondary">
                  {t(`backtest.optimizer.${lk}`)}
                </span>
              </label>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <UI.Input
                    type="number"
                    step="0.1"
                    className="font-mono tabular-nums"
                    value={s.form[vk] as string}
                    onChange={(e: any) => s.patchForm({ [vk]: e.target.value } as any)}
                    placeholder={t(`backtest.optimizer.${pk}`)}
                    disabled={!s.form[ek] as boolean}
                  />
                  <span className="text-caption text-fg-tertiary shrink-0">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PL.ParamGroup>
      <PL.ParamGroup
        title={t('Backtest Range')}
        info={t('Set the backtest time range for parameter search')}
      >
        <PL.ParamRow>
          {DATE_FLS.map(([k, lk, ty, pk]: any) => (
            <PL.ParamCard key={k} label={t(lk)}>
              <UI.Input
                type={ty as any}
                value={s.form[k] as string}
                onChange={(e: any) => s.patchForm({ [k]: e.target.value } as any)}
                placeholder={pk ? t(`backtest.optimizer.${pk}`) : undefined}
              />
            </PL.ParamCard>
          ))}
        </PL.ParamRow>
      </PL.ParamGroup>
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
  const chartData = (() => {
    const b = s.result.best,
      g = s.result.benchmarkGrowth;
    if (!b?.growthCurve) return [] as any;
    const m = new Map<string, any>();
    for (const p of b.growthCurve) m.set(p.date, { date: p.date, portfolio: p.value });
    if (g)
      for (const p of g) {
        const e = m.get(p.date);
        if (e) e.benchmark = p.value;
        else m.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
      }
    return [...m.values()].sort((a: any, b: any) => a.date.localeCompare(b.date));
  })();
  const nameMap: Record<string, string> = {
    portfolio: t('Optimal Portfolio'),
    benchmark: t('Benchmark'),
  };
  const bestMetrics = s.result.best
    ? [
        {
          label: '再平衡频率',
          value:
            s.result.best.rebalanceFrequency === 'threshold'
              ? `阈值(${s.result.best.rebalanceThreshold}%)`
              : t(REBALANCE_LABELS[s.result.best.rebalanceFrequency as RebalanceFrequency]) ||
                s.result.best.rebalanceFrequency,
        },
        { label: '初始资金', value: fmtAmount(s.result.best.initialCapital) },
        ...BEST_DEFS.map(([k, label, f]: any) => ({
          label,
          value: f(s.result.best![k] as number),
        })),
      ]
    : [];
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
        {s.result.best && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-body font-semibold text-fg">{t('Optimal Portfolio')}</div>
              <span className="text-caption text-fg-tertiary">
                {t('Total Combinations', { count: s.result.totalCombos })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {bestMetrics.map((m: any) => (
                <StatCard key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        )}
        {chartData.length > 0 && (
          <>
            <div className="mb-3 mt-6 text-body font-semibold text-fg">
              {t('Growth Comparison')}
            </div>
            <SimpleChart
              type="line"
              data={chartData}
              height={320}
              margin={{ left: 8, right: 20, top: 5, bottom: 5 }}
              xTickFormatter={(d: any) => String(d).substring(0, 7)}
              yTickFormatter={(v: any) => fmtAmount(v)}
              tooltipFormatter={(v: any, name: string) => [fmtAmount(v), nameMap[name] ?? name]}
              tooltipLabelFormatter={(d: string) => d}
              showLegend
              legendFormatter={(name: string) => nameMap[name] ?? name}
              series={[
                {
                  dataKey: 'portfolio',
                  name: nameMap.portfolio,
                  color: getPortfolioColor(0),
                  width: 2,
                },
                {
                  dataKey: 'benchmark',
                  name: nameMap.benchmark,
                  color: getPortfolioColor(1),
                  width: 1.5,
                  dash: '4 2',
                },
              ]}
            />
          </>
        )}
        <div className="mb-3 mt-6 text-body font-semibold text-fg">
          {t('Portfolio Comparison Table')}
        </div>
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
  return (
    <PL.ParamGroup
      title={t('Parameter Space')}
      info={t('Set the search range for rebalance frequency and thresholds')}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-caption font-medium text-fg-secondary">
            {t('Rebalancing Frequency')}
          </div>
          <div className="flex flex-wrap gap-2">
            {REBALANCE_FREQUENCY_OPTIONS.map((o: any) => (
              <UI.Button
                key={o.value}
                variant={s.frequencies.includes(o.value) ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => s.toggleFreq(o.value)}
              >
                {t(o.label)}
              </UI.Button>
            ))}
          </div>
        </div>
        {RANGE_DEFS.map((r: any) => (
          <div key={r.titleKey}>
            <div className="mb-1.5 text-caption font-medium text-fg-secondary">{t(r.titleKey)}</div>
            <PL.ParamRow>
              {r.fields.map(([lk, fk]: any) => (
                <PL.ParamCard key={lk} label={t(lk)}>
                  <div className="flex items-center gap-2">
                    {(r as any).prefix && (
                      <span className="text-body text-fg-tertiary font-mono shrink-0">
                        {(r as any).prefix === '$'
                          ? cur === 'cny'
                            ? '¥'
                            : '$'
                          : (r as any).prefix}
                      </span>
                    )}
                    <UI.Input
                      type="number"
                      step={r.step}
                      className="font-mono tabular-nums"
                      value={s.form[fk] as string}
                      onChange={(e: any) => s.patchForm({ [fk]: e.target.value } as any)}
                    />
                    {(r as any).suffix && (
                      <span className="text-caption text-fg-tertiary shrink-0">
                        {(r as any).suffix}
                      </span>
                    )}
                  </div>
                </PL.ParamCard>
              ))}
            </PL.ParamRow>
          </div>
        ))}
      </div>
    </PL.ParamGroup>
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
