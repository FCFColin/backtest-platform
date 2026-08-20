/* eslint-disable no-restricted-syntax -- BEST_METRIC_DEFS 中文为指标名映射，值经 fmt 处理非直接渲染 */
import { useTranslation } from 'react-i18next';
import { REBALANCE_FREQUENCY_OPTIONS } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import {
  ParamsPanel,
  ParamGroup,
  ParamRow,
  ParamCard,
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
import { SortableTable } from '../../components/tables.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import { useState } from 'react';
import i18n from '@/i18n/index.js';
import {
  REBALANCE_LABELS,
  type BacktestOptimizerObjective as Objective,
  type BestResultItem,
  type OptimizeResultItem,
  type RebalanceFrequency,
} from '@backtest/shared';
import { fmtPct, fmtNum, fmtAmount } from '@/utils/format';
import type { TableColumn } from '../../components/tables.js';
import { apiFetch } from '@/utils/apiClient';
import { extractApiErrorDetail } from '@/store/backtestHelpers.js';
import { pollJobStatus } from '@/store/backtestStore.js';
import { useAssetList } from '../../hooks/miscHooks.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
type OptimizerFormState = {
  thrMin: string;
  thrMax: string;
  thrStep: string;
  capMin: string;
  capMax: string;
  capStep: string;
  objective: Objective;
  enableMaxDD: boolean;
  maxDD: string;
  enableMinCagr: boolean;
  minCagr: string;
  startDate: string;
  endDate: string;
  benchmarkTicker: string;
};
interface OptimizerResultState {
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
  totalCombos: number;
}
interface BacktestOptimizerState {
  assets: Array<{ ticker: string; weight: string }>;
  frequencies: RebalanceFrequency[];
  form: OptimizerFormState;
  patchForm: (patch: Partial<OptimizerFormState>) => void;
  result: OptimizerResultState;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string) => void;
  toggleFreq: (freq: RebalanceFrequency) => void;
  runOptimize: () => Promise<void>;
}
interface OptimizerSectionProps {
  s: BacktestOptimizerState;
}
const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};
const mkCol = (
  key: keyof OptimizeResultItem,
  label: string,
  fmt: (v: number) => string,
): TableColumn<OptimizeResultItem> => ({
  key,
  label,
  sortValue: (r) => r[key] as number,
  render: (r) => fmt(r[key] as number),
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
  validAssets: Array<{ ticker: string; weight: string }>,
  frequencies: RebalanceFrequency[],
  form: OptimizerFormState,
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (form.enableMaxDD && form.maxDD !== '') c.maxDrawdown = Number(form.maxDD);
  if (form.enableMinCagr && form.minCagr !== '') c.minCagr = Number(form.minCagr);
  return {
    portfolio: {
      assets: validAssets.map((a) => ({
        ticker: normalizeTicker(a.ticker),
        weight: Number(a.weight) || 0,
      })),
    },
    parameterSpace: {
      rebalanceFrequencies: frequencies,
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
}
function buildChartData(
  best: BestResultItem | null,
  benchmarkGrowth: Array<{ date: string; value: number }> | null,
): Array<{ date: string; portfolio: number; benchmark?: number }> {
  if (!best?.growthCurve) return [];
  const map = new Map<string, { date: string; portfolio: number; benchmark?: number }>();
  for (const p of best.growthCurve) map.set(p.date, { date: p.date, portfolio: p.value });
  if (benchmarkGrowth) {
    for (const p of benchmarkGrowth) {
      const entry = map.get(p.date);
      if (entry) entry.benchmark = p.value;
      else map.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
const BEST_METRIC_DEFS: Array<[keyof BestResultItem, string, (v: number) => string]> = [
  ['cagr', 'CAGR', fmtPct],
  ['maxDrawdown', '最大回撤', fmtPct],
  ['stdev', '波动率', fmtPct],
  ['sharpe', 'Sharpe', fmtNum],
  ['sortino', 'Sortino', fmtNum],
  ['calmar', 'Calmar', fmtNum],
];
function buildBestMetrics(best: BestResultItem | null): Array<{ label: string; value: string }> {
  if (!best) return [];
  return [
    {
      label: '再平衡频率',
      value:
        best.rebalanceFrequency === 'threshold'
          ? `阈值(${best.rebalanceThreshold}%)`
          : i18n.t(REBALANCE_LABELS[best.rebalanceFrequency]) || best.rebalanceFrequency,
    },
    { label: '初始资金', value: fmtAmount(best.initialCapital) },
    ...BEST_METRIC_DEFS.map(([key, label, fmt]) => ({ label, value: fmt(best[key] as number) })),
  ];
}
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
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  const [form, setForm] = useState<OptimizerFormState>(DEFAULT_FORM);
  const patchForm = (patch: Partial<OptimizerFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));
  const [result, setResult] = useState<OptimizerResultState>(EMPTY_RESULT);
  const patchResult = (patch: Partial<OptimizerResultState>) =>
    setResult((prev) => ({ ...prev, ...patch }));
  const runOptimize = async () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      patchResult({ error: i18n.t('Please enter at least one ticker') });
      return;
    }
    if (frequencies.length === 0) {
      patchResult({ error: i18n.t('Please select at least one rebalancing frequency') });
      return;
    }
    patchResult({ isLoading: true, error: null, results: null, best: null, benchmarkGrowth: null });
    try {
      const res = await apiFetch('/api/v1/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOptimizeBody(validAssets, frequencies, form)),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(extractApiErrorDetail(json));
      const data = (
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
        results: data.results ?? [],
        best: data.best ?? null,
        benchmarkGrowth: data.benchmarkGrowth ?? null,
        totalCombos: data.totalCombinations ?? 0,
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

const OBJECTIVE_OPTIONS: Array<{ value: Objective; labelKey: string }> = [
  { value: 'maxCagr', labelKey: 'backtest.optimizer.maxCagr' },
  { value: 'minMaxDrawdown', labelKey: 'backtest.optimizer.minMaxDrawdown' },
  { value: 'maxSharpe', labelKey: 'backtest.optimizer.maxSharpe' },
  { value: 'maxSortino', labelKey: 'backtest.optimizer.maxSortino' },
];
const CONSTRAINT_DEFS: Array<{
  enabledKey: 'enableMaxDD' | 'enableMinCagr';
  valueKey: 'maxDD' | 'minCagr';
  labelKey: string;
  placeholderKey: string;
}> = [
  {
    enabledKey: 'enableMaxDD',
    valueKey: 'maxDD',
    labelKey: 'backtest.optimizer.maxDrawdownConstraint',
    placeholderKey: 'backtest.optimizer.maxDrawdownPlaceholder',
  },
  {
    enabledKey: 'enableMinCagr',
    valueKey: 'minCagr',
    labelKey: 'backtest.optimizer.cagrConstraint',
    placeholderKey: 'backtest.optimizer.cagrPlaceholder',
  },
];
const RANGE_DEFS: Array<{
  titleKey: string;
  prefix?: string;
  suffix?: string;
  step: string;
  fields: Array<[string, keyof OptimizerFormState]>;
}> = [
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
];
const DATE_FIELDS: Array<{
  key: keyof OptimizerFormState;
  labelKey: string;
  type: string;
  placeholderKey?: string;
}> = [
  { key: 'startDate', labelKey: 'Start Date', type: 'date' },
  { key: 'endDate', labelKey: 'End Date', type: 'date' },
  {
    key: 'benchmarkTicker',
    labelKey: 'backtest.optimizer.benchmarkTicker',
    type: 'text',
    placeholderKey: 'backtest.optimizer.benchmarkPlaceholder',
  },
];

export function OptimizerParams({ s }: OptimizerSectionProps) {
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
          {CONSTRAINT_DEFS.map((c) => (
            <div key={c.enabledKey} className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
                <Switch
                  checked={s.form[c.enabledKey]}
                  onCheckedChange={(v) => s.patchForm({ [c.enabledKey]: v })}
                />
                <span className="text-caption text-fg-secondary">{t(c.labelKey)}</span>
              </label>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    className="font-mono tabular-nums"
                    value={s.form[c.valueKey]}
                    onChange={(e) => s.patchForm({ [c.valueKey]: e.target.value })}
                    placeholder={t(c.placeholderKey)}
                    disabled={!s.form[c.enabledKey]}
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
          {DATE_FIELDS.map((f) => (
            <ParamCard key={f.key} label={t(f.labelKey)}>
              <Input
                type={f.type}
                value={s.form[f.key] as string}
                onChange={(e) => s.patchForm({ [f.key]: e.target.value })}
                placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
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

export function OptimizerResults({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const chartData = s.result.best ? buildChartData(s.result.best, s.result.benchmarkGrowth) : [];
  const nameMap: Record<string, string> = {
    portfolio: t('Optimal Portfolio'),
    benchmark: t('Benchmark'),
  };
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
              {buildBestMetrics(s.result.best).map((m) => (
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

function ParameterSpaceSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const currency = useSettingsStore((s) => s.currency);
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
                    {r.prefix && (
                      <span className="text-body text-fg-tertiary font-mono shrink-0">
                        {r.prefix === '$' ? (currency === 'cny' ? '¥' : '$') : r.prefix}
                      </span>
                    )}
                    <Input
                      type="number"
                      step={r.step}
                      className="font-mono tabular-nums"
                      value={s.form[formKey] as string}
                      onChange={(e) => s.patchForm({ [formKey]: e.target.value })}
                    />
                    {r.suffix && (
                      <span className="text-caption text-fg-tertiary shrink-0">{r.suffix}</span>
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
