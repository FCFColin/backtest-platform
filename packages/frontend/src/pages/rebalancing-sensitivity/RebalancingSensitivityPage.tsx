/* eslint-disable react-refresh/only-export-components */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as S from '@backtest/shared';
import { createComputeToolPage } from '@/components/shells/index.js';
import i18n from '@/i18n/index.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { BasicParamsFields } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '@/components/form/Field';
import { RunButton } from '@/components/form/sharedFields';
import { ResultsShell } from '@/components/resultsShell.js';
import * as Charts from '@/components/charts/sharedChartContent.js';
import * as UI from '@/components/ui/uiComponents';
import { apiFetch } from '@/utils/apiClient';
import {
  DEFAULT_60_40_ASSETS,
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  buildBacktestParameters,
  buildSinglePortfolioBody,
} from '@/utils/constants';
import { fmtPct } from '@/utils/format';
import { validateAssetWeights } from '@/utils/validation';
import { useAssetList, useSetterState } from '../../hooks/miscHooks.js';
type RebalanceFrequency = S.RebalanceFrequency;
type Bp = {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
};
type A = Array<{ ticker: string; weight: number }>;
const NUM_KEYS = ['cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino'] as const;
type NumKey = (typeof NUM_KEYS)[number];
type Bands = Record<'absoluteBand' | 'relativeBand', number | ''>;
type Curve = Array<{ date: string; value: number }>;
type PortRes = { statistics?: Record<string, number>; growthCurve?: Curve };
type FreqResult = {
  frequency: S.RebalanceFrequency;
  label: string;
  color: string;
  growthCurve?: Curve;
} & Record<NumKey, number>;
const REBALANCE_OPTIONS = S.REBALANCE_FREQUENCIES.map((v) => ({
  value: v,
  label: i18n.t(S.REBALANCE_LABELS[v]),
  color: S.REBALANCE_FREQUENCY_COLORS[v],
}));
const FREQ_ORDER = Object.fromEntries(S.REBALANCE_FREQUENCIES.map((f, i) => [f, i]));
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
const TH_CLS =
  'border-b-2 border-border-subtle px-3 py-2.5 text-caption font-semibold text-fg-tertiary';
const TD_CLS =
  'border-b border-border-subtle px-3 py-2 text-right font-mono text-label font-medium';

function buildBody(l: string, a: A, f: S.RebalanceFrequency, o: number, p: Bp) {
  return buildSinglePortfolioBody(
    l,
    a,
    { rebalanceFrequency: f, rebalanceOffset: o },
    buildBacktestParameters(p.startDate, p.endDate, p),
  );
}
async function postPortfolio(b: unknown): Promise<[number, Record<string, unknown> | null]> {
  const r = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });
  return [r.status, r.ok ? ((await r.json()) as Record<string, unknown>) : null];
}
function firstPortfolio(j: Record<string, unknown>) {
  return ((j.data ?? j) as { portfolios?: PortRes[] }).portfolios?.[0];
}
async function fetchFreqResult(f: S.RebalanceFrequency, a: A, p: Bp, s: Bands) {
  const o = REBALANCE_OPTIONS.find((v) => v.value === f)!,
    b = buildBody(o.label, a, f, 0, p),
    q = b.portfolios[0] as Record<string, unknown>;
  if (s.absoluteBand !== '' || s.relativeBand !== '')
    q.rebalanceBands = {
      enabled: true,
      absoluteBand: s.absoluteBand !== '' ? Number(s.absoluteBand) : undefined,
      relativeBand: s.relativeBand !== '' ? Number(s.relativeBand) : undefined,
    };
  const [sc, j] = await postPortfolio(b);
  if (!j) throw new Error(`HTTP ${sc} (${o.label})`);
  if (j.success === false)
    throw new Error(
      (j.error as string) || i18n.t('Backtest failed ({{label}})', { label: o.label }),
    );
  const w = firstPortfolio(j);
  if (!w) throw new Error(i18n.t('No results ({{label}})', { label: o.label }));
  const st = w.statistics ?? {};
  return {
    frequency: f,
    label: o.label,
    color: o.color,
    ...(Object.fromEntries(NUM_KEYS.map((k) => [k, st[k] ?? 0])) as Record<NumKey, number>),
    growthCurve: w.growthCurve,
  } satisfies FreqResult;
}
async function fetchOffsetResult(o: number, f: S.RebalanceFrequency, a: A, p: Bp) {
  const [, j] = await postPortfolio(buildBody(`offset-${o}`, a, f, o, p));
  return { offset: o, cagr: (j && firstPortfolio(j)?.statistics?.cagr) ?? 0 };
}
const TABS = ['scatter', 'distributions', 'offset', 'table'].map((key) => ({
  key,
  labelKey: `rebalancingSensitivity.tab.${key}`,
}));
function useRebalSetters() {
  return useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    adjustForInflation: false,
    baseCurrency: 'usd' as 'usd' | 'cny',
    startingValue: 10000,
    selectedFreqs: ['monthly', 'quarterly', 'annual'] as RebalanceFrequency[],
    absoluteBand: '' as number | '',
    relativeBand: '' as number | '',
    isLoading: false,
    error: null as string | null,
    results: [] as FreqResult[],
    activeTab: 'scatter',
    offsetFreq: 'monthly' as RebalanceFrequency,
    offsetResults: [] as Array<{ offset: number; cagr: number }>,
    isLoadingOffset: false,
  });
}
function createRebalancingRunners(s: ReturnType<typeof useRebalSetters>, p: Bp, assets: A) {
  const validate = (): A | string => {
    const v = assets.filter((a) => a.ticker.trim() !== '');
    if (!v.length) return i18n.t('Please add at least one ticker');
    const e = validateAssetWeights(assets);
    return (
      e || (s.selectedFreqs.length ? v : i18n.t('Please select at least one rebalancing frequency'))
    );
  };
  const runOffsetScan = async (
    f: RebalanceFrequency,
    v: A = assets.filter((a) => a.ticker.trim() !== ''),
  ) => {
    if (!v.length) return;
    s.setIsLoadingOffset(true);
    s.setOffsetResults([]);
    try {
      s.setOffsetResults(await Promise.all(OFFSETS.map((o) => fetchOffsetResult(o, f, v, p))));
    } catch {
      s.setError(i18n.t('Rebalancing sensitivity analysis failed'));
    } finally {
      s.setIsLoadingOffset(false);
    }
  };
  const runSensitivity = async () => {
    const v = validate();
    if (typeof v === 'string') return void s.setError(v);
    s.setIsLoading(true);
    s.setError(null);
    s.setResults([]);
    s.setOffsetResults([]);
    try {
      const all = await Promise.all(s.selectedFreqs.map((f) => fetchFreqResult(f, v, p, s)));
      all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]);
      s.setResults(all);
      if (s.selectedFreqs.length) void runOffsetScan(s.selectedFreqs[0], v);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : i18n.t('Analysis failed'));
    } finally {
      s.setIsLoading(false);
    }
  };
  return { runSensitivity, runOffsetScan };
}
function useRebalancingState() {
  const s = useRebalSetters();
  const freqs = s.selectedFreqs;
  const toggleFreq = (f: RebalanceFrequency) =>
    s.setSelectedFreqs(freqs.includes(f) ? freqs.filter((x) => x !== f) : [...freqs, f]);
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<A[number]>(
    [...DEFAULT_60_40_ASSETS],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const { runSensitivity, runOffsetScan } = createRebalancingRunners(s, s, assets);
  return {
    ...s,
    toggleFreq,
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runSensitivity,
    runOffsetScan,
  };
}
type RebalancingState = ReturnType<typeof useRebalancingState>;
const TABLE_COLS: Array<[string, NumKey, (v: number) => string]> = [
  ['stats.cagr', 'cagr', fmtPct],
  ['Volatility', 'stdev', fmtPct],
  ['Max Drawdown', 'maxDrawdown', fmtPct],
  ['Sharpe', 'sharpe', (v) => v.toFixed(2)],
  ['Sortino', 'sortino', (v) => v.toFixed(2)],
];
function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  const scatterData = s.results.map((r) => ({
    ...r,
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    maxDrawdown: r.maxDrawdown * 100,
  }));
  const offsetGrowthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  const best = Object.fromEntries(
    NUM_KEYS.map((k) => [
      k,
      (k === 'stdev' || k === 'maxDrawdown' ? Math.min : Math.max)(...s.results.map((x) => x[k])),
    ]),
  );
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Analysis failed')}: `}
      isLoading={s.isLoading}
      hasResults={s.results.length > 0}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Select rebalancing frequencies and click "Run Analysis"')}
    >
      <UI.Card className="p-5">
        <UI.Tabs value={s.activeTab} onValueChange={s.setActiveTab}>
          <UI.TabsList className="mb-4 flex-wrap">
            {TABS.map((tab) => (
              <UI.TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </UI.TabsTrigger>
            ))}
          </UI.TabsList>
          <UI.TabsContent value="scatter">
            <Charts.XYScatterChart
              xKey="volatility"
              yKey="cagr"
              xName={t('Volatility')}
              yName="CAGR"
              height={400}
              margin={{ top: 20, right: 30, bottom: 30, left: 10 }}
              zRange={[60, 200]}
              xTickFormatter={(v: number) => `${v.toFixed(1)}%`}
              yTickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tooltipFormatter={(v: number, name: string) =>
                name === 'sharpe' || name === 'sortino' ? v.toFixed(2) : `${v.toFixed(2)}%`
              }
              series={scatterData.map((p) => ({ data: [p], color: p.color, zDataKey: 'sharpe' }))}
            />
          </UI.TabsContent>
          <UI.TabsContent value="distributions">
            <Charts.BarChartContent
              data={s.results.map((r) => ({
                name: t(`rebalancingSensitivity.freq.${r.frequency}`),
                CAGR: Number((r.cagr * 100).toFixed(2)),
                fill: r.color,
              }))}
              seriesNames={['CAGR']}
              xDataKey="name"
              height={400}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
          </UI.TabsContent>
          <UI.TabsContent value="offset">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-body text-fg-tertiary">{t('Frequency')}:</span>
              <UI.Select
                value={s.offsetFreq}
                onValueChange={(f) => {
                  s.setOffsetFreq(f as RebalanceFrequency);
                  void s.runOffsetScan(f as RebalanceFrequency);
                }}
              >
                <UI.SelectTrigger className="h-9 w-32" aria-label={t('Frequency')}>
                  <UI.SelectValue />
                </UI.SelectTrigger>
                <UI.SelectContent position="popper" sideOffset={4}>
                  {REBALANCE_OPTIONS.map((o) => (
                    <UI.SelectItem key={o.value} value={o.value}>
                      {t(`rebalancingSensitivity.freq.${o.value}`)}
                    </UI.SelectItem>
                  ))}
                </UI.SelectContent>
              </UI.Select>
              {s.isLoadingOffset && <Loader2 className="size-4 animate-spin text-fg-tertiary" />}
            </div>
            <Charts.BarChartContent
              data={s.offsetResults.map((r) => ({
                offset: `+${r.offset}d`,
                CAGR: Number((r.cagr * 100).toFixed(2)),
              }))}
              seriesNames={['CAGR']}
              xDataKey="offset"
              height={250}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
            {offsetGrowthData.length > 0 && (
              <Charts.SimpleLineChart
                data={offsetGrowthData}
                series={[{ dataKey: 'value', color: getPortfolioColor(0) }]}
                xDataKey="date"
                height={250}
                xTickFormatter={(v) => String(v).slice(0, 7)}
                yTickFormatter={(v) => v.toLocaleString()}
                showLegend={false}
              />
            )}
          </UI.TabsContent>
          <UI.TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-input-bg">
                    <th className={`${TH_CLS} text-left`}>{t('Frequency')}</th>
                    {TABLE_COLS.map(([label]) => (
                      <th key={label} className={`${TH_CLS} text-right`}>
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.results.map((r, idx) => (
                    <tr key={r.frequency} className={idx % 2 === 1 ? 'bg-input-bg' : ''}>
                      <td className="border-b border-border-subtle px-3 py-2 text-label text-fg">
                        <UI.PortfolioLabel color={r.color} name={r.label} />
                      </td>
                      {TABLE_COLS.map(([, key, fmt]) => (
                        <td
                          key={key}
                          className={`${TD_CLS} ${r[key] === best[key] ? 'font-bold text-success' : 'text-fg'}`}
                        >
                          {fmt(r[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </UI.TabsContent>
        </UI.Tabs>
      </UI.Card>
    </ResultsShell>
  );
}
function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  const band = (label: string, value: number | '', on: (v: number | '') => void, max: number) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <UI.AffixInput
        type="number"
        value={value}
        onChange={(e) => on(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={t('Leave empty to disable')}
        min={0}
        max={max}
        suffix="%"
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsFields
        startDate={s.startDate}
        endDate={s.endDate}
        startingValue={s.startingValue}
        baseCurrency={s.baseCurrency}
        adjustForInflation={s.adjustForInflation}
        onChange={(field, value) => {
          if (field === 'startDate') s.setStartDate(value as string);
          else if (field === 'endDate') s.setEndDate(value as string);
          else if (field === 'startingValue') s.setStartingValue(value as number);
          else if (field === 'baseCurrency') s.setBaseCurrency(value as 'usd' | 'cny');
          else if (field === 'adjustForInflation') s.setAdjustForInflation(value as boolean);
        }}
      />
      <Field>
        <FieldLabel>{t('Rebalancing Frequency (multi-select)')}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {REBALANCE_OPTIONS.map((opt) => {
            const sel = s.selectedFreqs.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-semibold transition-colors"
                style={{
                  borderColor: sel ? opt.color : 'hsl(var(--border))',
                  backgroundColor: sel
                    ? `color-mix(in srgb, ${opt.color} 10%, transparent)`
                    : 'transparent',
                  color: sel ? opt.color : 'hsl(var(--fg-tertiary))',
                }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sel}
                  onChange={() => s.toggleFreq(opt.value)}
                />
                <UI.PortfolioLabel
                  color={opt.color}
                  name={t(`rebalancingSensitivity.freq.${opt.value}`)}
                />
              </label>
            );
          })}
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {band(t('Absolute Deviation Band'), s.absoluteBand, s.setAbsoluteBand, 50)}
        {band(t('Relative Deviation Band'), s.relativeBand, s.setRelativeBand, 100)}
      </div>
      <PortfolioEditor
        singleMode
        assets={s.assets}
        totalWeight={s.totalWeight}
        onAdd={s.addAsset}
        onRemove={s.removeAsset}
        onUpdate={s.updateAsset}
      />
      <RunButton
        isLoading={s.isLoading}
        onClick={() => void s.runSensitivity()}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
        type="button"
      />
    </div>
  );
}
export default createComputeToolPage(useRebalancingState, {
  titleKey: 'nav.rebalancingSensitivity',
  seoDescKey: 'rebalancingSensitivity.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'rebalancingSensitivity.seo.analyzableDesc' },
    {
      titleKey: 'rebalancingSensitivity.seo.offsetScanTitle',
      descKey: 'rebalancingSensitivity.seo.offsetScanDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.lumpsumVsDca', href: '/lumpsum-vs-dca' },
  ],
  params: ({ state }) => <RebalancingSensitivityParamsForm s={state} />,
  results: ({ state }) => <ResultsPanel s={state} />,
});
