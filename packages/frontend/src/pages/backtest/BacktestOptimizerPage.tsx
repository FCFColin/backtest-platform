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
import {
  ParamCard,
  ParamGroup,
  ParamsPanel,
  ParamRow,
} from '../../components/params/paramsLayout.js';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/uiComponents';
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
type OptimizerFormState = Record<
  | 'thrMin'
  | 'thrMax'
  | 'thrStep'
  | 'capMin'
  | 'capMax'
  | 'capStep'
  | 'maxDD'
  | 'minCagr'
  | 'startDate'
  | 'endDate'
  | 'benchmarkTicker',
  string
> & { objective: Objective; enableMaxDD: boolean; enableMinCagr: boolean };
type OptimizerResultState = {
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: { date: string; value: number }[] | null;
  totalCombos: number;
};
type BacktestOptimizerState = {
  assets: { ticker: string; weight: string }[];
  frequencies: RebalanceFrequency[];
  form: OptimizerFormState;
  patchForm: (p: Partial<OptimizerFormState>) => void;
  result: OptimizerResultState;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, f: 'ticker' | 'weight', v: string) => void;
  toggleFreq: (f: RebalanceFrequency) => void;
  runOptimize: () => Promise<void>;
};
const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};
const mkCol = (
  k: keyof OptimizeResultItem,
  l: string,
  f: (v: number) => string,
): TableColumn<OptimizeResultItem> => ({
  key: k,
  label: l,
  sortValue: (r) => r[k] as number,
  render: (r) => f(r[k] as number),
});
const TABLE_COLUMNS: TableColumn<OptimizeResultItem>[] = [
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
  mkCol('cagr', i18n.t('stats.cagr'), fmtPct),
  mkCol('maxDrawdown', i18n.t('Max Drawdown'), fmtPct),
  mkCol('stdev', i18n.t('Volatility'), fmtPct),
  mkCol('sharpe', i18n.t('Sharpe'), fmtNum),
  mkCol('sortino', 'Sortino', fmtNum),
  mkCol('calmar', 'Calmar', fmtNum),
];
const DEFAULT_FORM: OptimizerFormState = {
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
const EMPTY_RESULT: OptimizerResultState = {
  isLoading: false,
  error: null,
  results: null,
  best: null,
  benchmarkGrowth: null,
  totalCombos: 0,
};
function buildOptimizeBody(
  v: { ticker: string; weight: string }[],
  f: RebalanceFrequency[],
  s: OptimizerFormState,
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (s.enableMaxDD && s.maxDD !== '') c.maxDrawdown = Number(s.maxDD);
  if (s.enableMinCagr && s.minCagr !== '') c.minCagr = Number(s.minCagr);
  return {
    portfolio: {
      assets: v.map((a) => ({ ticker: normalizeTicker(a.ticker), weight: Number(a.weight) || 0 })),
    },
    parameterSpace: {
      rebalanceFrequencies: f,
      rebalanceThreshold: { min: Number(s.thrMin), max: Number(s.thrMax), step: Number(s.thrStep) },
      initialCapital: { min: Number(s.capMin), max: Number(s.capMax), step: Number(s.capStep) },
    },
    parameters: {
      startDate: s.startDate,
      endDate: s.endDate,
      benchmarkTicker: normalizeTicker(s.benchmarkTicker),
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
    objective: s.objective,
    constraints: c,
  };
}
function buildChartData(
  b: BestResultItem | null,
  g: { date: string; value: number }[] | null,
): { date: string; portfolio: number; benchmark?: number }[] {
  if (!b?.growthCurve) return [];
  const m = new Map<string, { date: string; portfolio: number; benchmark?: number }>();
  for (const p of b.growthCurve) m.set(p.date, { date: p.date, portfolio: p.value });
  if (g)
    for (const p of g) {
      const e = m.get(p.date);
      if (e) e.benchmark = p.value;
      else m.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
const BEST_METRIC_DEFS: [keyof BestResultItem, string, (v: number) => string][] = [
  ['cagr', 'CAGR', fmtPct],
  ['maxDrawdown', '最大回撤', fmtPct],
  ['stdev', '波动率', fmtPct],
  ['sharpe', 'Sharpe', fmtNum],
  ['sortino', 'Sortino', fmtNum],
  ['calmar', 'Calmar', fmtNum],
];
function useOptimizerState(): BacktestOptimizerState {
  const { assets, addAsset, removeAsset, updateAsset } = useAssetList<{
    ticker: string;
    weight: string;
  }>(
    [
      { ticker: 'VTI', weight: '60' },
      { ticker: 'BND', weight: '40' },
    ],
    () => ({ ticker: '', weight: '' }),
    1,
  );
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const toggleFreq = (freq: RebalanceFrequency) =>
    setFrequencies((p) => (p.includes(freq) ? p.filter((f) => f !== freq) : [...p, freq]));
  const [form, setForm] = useState<OptimizerFormState>(DEFAULT_FORM);
  const patchForm = (p: Partial<OptimizerFormState>) => setForm((v) => ({ ...v, ...p }));
  const [result, setResult] = useState<OptimizerResultState>(EMPTY_RESULT);
  const patchResult = (p: Partial<OptimizerResultState>) => setResult((v) => ({ ...v, ...p }));
  const runOptimize = async () => {
    const v = assets.filter((a) => a.ticker.trim());
    if (!v.length) return patchResult({ error: i18n.t('Please enter at least one ticker') });
    if (!frequencies.length)
      return patchResult({ error: i18n.t('Please select at least one rebalancing frequency') });
    patchResult({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const res = await apiFetch('/api/v1/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOptimizeBody(v, frequencies, form)),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(extractApiErrorDetail(json));
      const d = (
        json.data?.statusUrl
          ? (await pollJobStatus(json.data.statusUrl, new AbortController().signal, null)).data
          : json.data
      ) as {
        results?: OptimizeResultItem[];
        best?: BestResultItem | null;
        benchmarkGrowth?: { date: string; value: number }[] | null;
        totalCombinations?: number;
      };
      patchResult({
        results: d.results ?? [],
        best: d.best ?? null,
        benchmarkGrowth: d.benchmarkGrowth ?? null,
        totalCombos: d.totalCombinations ?? 0,
      });
    } catch (e) {
      patchResult({ error: e instanceof Error ? e.message : i18n.t('Optimization failed') });
    } finally {
      patchResult({ isLoading: false });
    }
  };
  return {
    assets,
    frequencies,
    form,
    patchForm,
    result,
    addAsset,
    removeAsset,
    updateAsset,
    toggleFreq,
    runOptimize,
  };
}
const OBJECTIVE_OPTIONS = [
  { value: 'maxCagr', labelKey: 'backtest.optimizer.maxCagr' },
  { value: 'minMaxDrawdown', labelKey: 'backtest.optimizer.minMaxDrawdown' },
  { value: 'maxSharpe', labelKey: 'backtest.optimizer.maxSharpe' },
  { value: 'maxSortino', labelKey: 'backtest.optimizer.maxSortino' },
] as const;
const CONSTRAINT_DEFS = [
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
const DATE_FIELDS = [
  ['startDate', 'Start Date', 'date'],
  ['endDate', 'End Date', 'date'],
  ['benchmarkTicker', 'backtest.optimizer.benchmarkTicker', 'text', 'benchmarkPlaceholder'],
] as const;
export function OptimizerParams({ s }: { s: BacktestOptimizerState }) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <ParamGroup
        title={t('Portfolio Allocation')}
        info={t('Add tickers and weights for optimization')}
      >
        <SinglePortfolioEditor
          singleMode
          assets={s.assets.map(({ ticker, weight }) => ({ ticker, weight: Number(weight) || 0 }))}
          totalWeight={s.assets.reduce((sum, a) => sum + (Number(a.weight) || 0), 0)}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={(i, field, val) => s.updateAsset(i, field, String(val))}
          wrapInSection={false}
        />
      </ParamGroup>
      <ParameterSpaceSection s={s} />
      <ParamGroup title={t('Objective')} info={t('Select optimization objective and constraints')}>
        <ParamRow>
          <ParamCard label={t('Target')}>
            <Select
              value={s.form.objective}
              onValueChange={(v) => s.patchForm({ objective: v as Objective })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamCard>
        </ParamRow>
        <div className="mt-3 flex flex-col gap-3">
          {CONSTRAINT_DEFS.map(([ek, vk, lk, pk]) => (
            <div key={ek} className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
                <Switch
                  checked={s.form[ek as keyof OptimizerFormState] as boolean}
                  onCheckedChange={(v) => s.patchForm({ [ek]: v } as any)}
                />
                <span className="text-caption text-fg-secondary">
                  {t(`backtest.optimizer.${lk}`)}
                </span>
              </label>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    className="font-mono tabular-nums"
                    value={s.form[vk as keyof OptimizerFormState] as string}
                    onChange={(e) => s.patchForm({ [vk]: e.target.value } as any)}
                    placeholder={t(`backtest.optimizer.${pk}`)}
                    disabled={!s.form[ek as keyof OptimizerFormState] as boolean}
                  />
                  <span className="text-caption text-fg-tertiary shrink-0">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ParamGroup>
      <ParamGroup
        title={t('Backtest Range')}
        info={t('Set the backtest time range for parameter search')}
      >
        <ParamRow>
          {DATE_FIELDS.map(([k, lk, ty, pk]) => (
            <ParamCard key={k} label={t(lk)}>
              <Input
                type={ty as any}
                value={s.form[k as keyof OptimizerFormState] as string}
                onChange={(e) => s.patchForm({ [k]: e.target.value } as any)}
                placeholder={pk ? t(`backtest.optimizer.${pk}`) : undefined}
              />
            </ParamCard>
          ))}
        </ParamRow>
      </ParamGroup>
      <div className="py-3">
        <RunButton
          isLoading={s.result.isLoading}
          onClick={() => void s.runOptimize()}
          label={t('Start Optimization')}
          loadingLabel={t('Optimizing...')}
        />
      </div>
    </ParamsPanel>
  );
}
export function OptimizerResults({ s }: { s: BacktestOptimizerState }) {
  const { t } = useTranslation();
  const chartData = s.result.best ? buildChartData(s.result.best, s.result.benchmarkGrowth) : [];
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
              : t(REBALANCE_LABELS[s.result.best.rebalanceFrequency]) ||
                s.result.best.rebalanceFrequency,
        },
        { label: '初始资金', value: fmtAmount(s.result.best.initialCapital) },
        ...BEST_METRIC_DEFS.map(([k, label, f]) => ({
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
              {bestMetrics.map((m) => (
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
              xTickFormatter={(d: number | string) => String(d).substring(0, 7)}
              yTickFormatter={(v: number) => fmtAmount(v)}
              tooltipFormatter={(v: number, name: string) => [fmtAmount(v), nameMap[name] ?? name]}
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
            columns={TABLE_COLUMNS}
            data={s.result.results ?? []}
            initialSortKey={OBJECTIVE_SORT_KEY[s.form.objective]}
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
  const currency = useSettingsStore((x) => x.currency);
  return (
    <ParamGroup
      title={t('Parameter Space')}
      info={t('Set the search range for rebalance frequency and thresholds')}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-caption font-medium text-fg-secondary">
            {t('Rebalancing Frequency')}
          </div>
          <div className="flex flex-wrap gap-2">
            {REBALANCE_FREQUENCY_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant={s.frequencies.includes(o.value) ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => s.toggleFreq(o.value)}
              >
                {t(o.label)}
              </Button>
            ))}
          </div>
        </div>
        {RANGE_DEFS.map((r) => (
          <div key={r.titleKey}>
            <div className="mb-1.5 text-caption font-medium text-fg-secondary">{t(r.titleKey)}</div>
            <ParamRow>
              {r.fields.map(([labelKey, formKey]) => (
                <ParamCard key={labelKey} label={t(labelKey)}>
                  <div className="flex items-center gap-2">
                    {(r as any).prefix && (
                      <span className="text-body text-fg-tertiary font-mono shrink-0">
                        {(r as any).prefix === '$'
                          ? currency === 'cny'
                            ? '¥'
                            : '$'
                          : (r as any).prefix}
                      </span>
                    )}
                    <Input
                      type="number"
                      step={r.step}
                      className="font-mono tabular-nums"
                      value={s.form[formKey as keyof OptimizerFormState] as string}
                      onChange={(e) =>
                        s.patchForm({ [formKey]: e.target.value } as Partial<OptimizerFormState>)
                      }
                    />
                    {(r as any).suffix && (
                      <span className="text-caption text-fg-tertiary shrink-0">
                        {(r as any).suffix}
                      </span>
                    )}
                  </div>
                </ParamCard>
              ))}
            </ParamRow>
          </div>
        ))}
      </div>
    </ParamGroup>
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
  params: ({ state }) => <OptimizerParams s={state} />,
  results: ({ state }) => <OptimizerResults s={state} />,
};
export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return <ComputeToolShell config={config} state={s} />;
}
