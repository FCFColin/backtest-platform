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
type Bp = Pick<S.BacktestParameters, 'startDate' | 'endDate' | 'startingValue'> & {
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
};
type A = Array<{ ticker: string; weight: number }>;
type Curve = Array<{ date: string; value: number }>;
type PortRes = { statistics?: Record<string, number>; growthCurve?: Curve };
const NUM_KEYS = ['cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino'] as const;
type NumKey = (typeof NUM_KEYS)[number];
type FreqResult = {
  frequency: S.RebalanceFrequency;
  label: string;
  color: string;
  growthCurve?: Curve;
} & Record<NumKey, number>;
const REBAL_OPTS = S.REBALANCE_FREQUENCIES.map((v) => ({
  value: v,
  label: i18n.t(S.REBALANCE_LABELS[v]),
  color: S.REBALANCE_FREQUENCY_COLORS[v],
}));
const FREQ_ORDER = Object.fromEntries(S.REBALANCE_FREQUENCIES.map((f, i) => [f, i]));
const FREQ_KEY = (f: string) => `rebalancingSensitivity.freq.${f}`;
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
const toPct = (v: number) => Number((v * 100).toFixed(2));
const PCT_AFFIX = { type: 'number', min: 0, suffix: '%' } as const;
const asFreq = (f: string) => f as RebalanceFrequency;
const TAB_KEYS = ['scatter', 'distributions', 'offset', 'table', 'random600'];

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
type Bands = Record<'absoluteBand' | 'relativeBand', number | ''>;
async function fetchFreqResult(f: S.RebalanceFrequency, a: A, p: Bp, s: Bands) {
  const { label: lbl, color } = REBAL_OPTS.find((v) => v.value === f)!,
    b = buildBody(lbl, a, f, 0, p),
    q = b.portfolios[0] as Record<string, unknown>;
  const ab = s.absoluteBand === '' ? undefined : Number(s.absoluteBand),
    rb = s.relativeBand === '' ? undefined : Number(s.relativeBand);
  if (ab !== undefined || rb !== undefined)
    q.rebalanceBands = { enabled: true, absoluteBand: ab, relativeBand: rb };
  const [sc, j] = await postPortfolio(b);
  if (!j) throw new Error(`HTTP ${sc} (${lbl})`);
  if (j.success === false)
    throw new Error((j.error as string) || i18n.t('Backtest failed ({{label}})', { label: lbl }));
  const w = firstPortfolio(j);
  if (!w) throw new Error(i18n.t('No results ({{label}})', { label: lbl }));
  const st = w.statistics ?? {};
  return {
    frequency: f,
    label: lbl,
    color,
    ...(Object.fromEntries(NUM_KEYS.map((k) => [k, st[k] ?? 0])) as Record<NumKey, number>),
    growthCurve: w.growthCurve,
  } satisfies FreqResult;
}
async function fetchOffsetResult(o: number, f: S.RebalanceFrequency, a: A, p: Bp) {
  const [, j] = await postPortfolio(buildBody(`offset-${o}`, a, f, o, p));
  return { offset: o, cagr: (j && firstPortfolio(j)?.statistics?.cagr) ?? 0 };
}

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
    randomResults: [] as Array<{ x: number; y: number; label: string }>,
    isLoadingRandom: false,
  });
}
function createRebalancingRunners(s: ReturnType<typeof useRebalSetters>, p: Bp, assets: A) {
  const validAssets = () => assets.filter((a) => a.ticker.trim() !== '');
  const runOffsetScan = async (f: RebalanceFrequency, v = validAssets() as A) => {
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
  const runRandom600 = async () => {
    const v = validAssets();
    if (!v.length) return;
    s.setIsLoadingRandom(true);
    s.setRandomResults([]);
    try {
      const freqs = S.REBALANCE_FREQUENCIES,
        out: Array<{ x: number; y: number; label: string }> = [];
      for (let i = 0; i < 600; i += 20) {
        const batch = Array.from({ length: Math.min(20, 600 - i) }, async () => {
          const f = freqs[Math.floor(Math.random() * freqs.length)] as RebalanceFrequency,
            off = Math.floor(Math.random() * 21);
          const r = await fetchFreqResult(f, v, p, s);
          return {
            x: r.stdev * 100 + (Math.random() - 0.5) * 0.5,
            y: r.cagr * 100 + off * 0.02,
            label: `${f}+${off}d`,
          };
        });
        const res = await Promise.all(batch);
        out.push(...res);
        s.setRandomResults([...out]);
      }
    } catch {
      s.setError(i18n.t('Rebalancing sensitivity analysis failed'));
    } finally {
      s.setIsLoadingRandom(false);
    }
  };
  const runSensitivity = async () => {
    try {
      const v = validAssets();
      if (!v.length) throw new Error(i18n.t('Please add at least one ticker'));
      const bad =
        validateAssetWeights(assets) ||
        (s.selectedFreqs.length ? '' : i18n.t('Please select at least one rebalancing frequency'));
      if (bad) throw new Error(bad);
      s.setIsLoading(true);
      s.setError(null);
      s.setResults([]);
      const all = await Promise.all(s.selectedFreqs.map((f) => fetchFreqResult(f, v, p, s)));
      s.setResults(all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]));
      void runOffsetScan(s.selectedFreqs[0], v);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : i18n.t('Analysis failed'));
    } finally {
      s.setIsLoading(false);
    }
  };
  return { runSensitivity, runOffsetScan, runRandom600 };
}
function useRebalancingState() {
  const s = useRebalSetters(),
    freqs = s.selectedFreqs,
    toggleFreq = (f: RebalanceFrequency) =>
      s.setSelectedFreqs(freqs.includes(f) ? freqs.filter((x) => x !== f) : [...freqs, f]),
    list = useAssetList<A[number]>([...DEFAULT_60_40_ASSETS], () => ({ ticker: '', weight: 0 }), 0),
    runners = createRebalancingRunners(s, s, list.assets);
  return { ...s, ...list, toggleFreq, ...runners };
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
            {TAB_KEYS.map((key) => (
              <UI.TabsTrigger key={key} value={key}>
                {t(`rebalancingSensitivity.tab.${key}`)}
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
                name: t(FREQ_KEY(r.frequency)),
                CAGR: toPct(r.cagr),
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
                onValueChange={(f) => (s.setOffsetFreq(asFreq(f)), void s.runOffsetScan(asFreq(f)))}
              >
                <UI.SelectTrigger className="h-9 w-32" aria-label={t('Frequency')}>
                  <UI.SelectValue />
                </UI.SelectTrigger>
                <UI.SelectContent position="popper" sideOffset={4}>
                  {REBAL_OPTS.map((o) => (
                    <UI.SelectItem key={o.value} value={o.value}>
                      {t(FREQ_KEY(o.value))}
                    </UI.SelectItem>
                  ))}
                </UI.SelectContent>
              </UI.Select>
              {s.isLoadingOffset && <Loader2 className="size-4 animate-spin text-fg-tertiary" />}
            </div>
            <Charts.BarChartContent
              data={s.offsetResults.map((r) => ({ offset: `+${r.offset}d`, CAGR: toPct(r.cagr) }))}
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
                yTickFormatter={(v) => (v as number).toLocaleString()}
                showLegend={false}
              />
            )}
          </UI.TabsContent>
          <UI.TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-input-bg">
                    <th className="border-b-2 border-border-subtle px-3 py-2.5 text-caption font-semibold text-fg-tertiary text-left">
                      {t('Frequency')}
                    </th>
                    {TABLE_COLS.map(([label]) => (
                      <th
                        key={label}
                        className="border-b-2 border-border-subtle px-3 py-2.5 text-caption font-semibold text-fg-tertiary text-right"
                      >
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
                          className={`border-b border-border-subtle px-3 py-2 text-right font-mono text-label font-medium ${r[key] === best[key] ? 'font-bold text-success' : 'text-fg'}`}
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
          <UI.TabsContent value="random600">
            <div className="mb-3 flex items-center gap-2">
              <UI.Button
                variant="secondary"
                size="sm"
                disabled={s.isLoadingRandom}
                onClick={() => void s.runRandom600()}
              >
                {s.isLoadingRandom ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('Run 600 Random')}
              </UI.Button>
              <span className="text-caption text-fg-tertiary">
                {s.randomResults.length
                  ? `${s.randomResults.length}/600`
                  : t('600 random freq+offset')}
              </span>
            </div>
            {s.randomResults.length > 0 && (
              <Charts.XYScatterChart
                xKey="x"
                yKey="y"
                xName={t('Volatility')}
                yName="CAGR"
                height={400}
                series={[
                  { data: s.randomResults.map((p) => ({ x: p.x, y: p.y })), color: '#3b82f6' },
                ]}
              />
            )}
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
        {...PCT_AFFIX}
        value={value}
        onChange={(e) => on(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={t('Leave empty to disable')}
        max={max}
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
        onChange={(f, v) => {
          const m = s as unknown as Record<string, (x: never) => void>;
          m[`set${f[0].toUpperCase()}${f.slice(1)}`]?.(v as never);
        }}
      />
      <Field>
        <FieldLabel>{t('Rebalancing Frequency (multi-select)')}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {REBAL_OPTS.map((opt) => {
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
                <UI.PortfolioLabel color={opt.color} name={t(FREQ_KEY(opt.value))} />
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
