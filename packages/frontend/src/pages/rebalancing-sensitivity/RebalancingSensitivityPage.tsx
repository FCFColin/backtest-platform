/* eslint-disable react-refresh/only-export-components */
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  REBALANCE_FREQUENCIES,
  REBALANCE_FREQUENCY_COLORS,
  REBALANCE_LABELS,
  type RebalanceFrequency,
} from '@backtest/shared';
import { createComputeToolPage } from '@/components/shells/index.js';
import i18n from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient';
import {
  buildBacktestParameters,
  buildSinglePortfolioBody,
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_60_40_ASSETS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import { useAssetList, useSetterState } from '../../hooks/miscHooks.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
type BacktestParamsInput = {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
};
const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] =
  REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: i18n.t(REBALANCE_LABELS[value]),
    color: REBALANCE_FREQUENCY_COLORS[value],
  }));
interface FreqResult {
  frequency: RebalanceFrequency;
  label: string;
  color: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  growthCurve?: Array<{ date: string; value: number }>;
}
const FREQ_ORDER = Object.fromEntries(REBALANCE_FREQUENCIES.map((f, i) => [f, i]));
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
function buildBacktestBody(
  label: string,
  assets: Array<{ ticker: string; weight: number }>,
  freq: RebalanceFrequency,
  offset: number,
  params: BacktestParamsInput,
) {
  return buildSinglePortfolioBody(
    label,
    assets,
    { rebalanceFrequency: freq, rebalanceOffset: offset },
    buildBacktestParameters(params.startDate, params.endDate, {
      startingValue: params.startingValue,
      baseCurrency: params.baseCurrency,
      adjustForInflation: params.adjustForInflation,
    }),
  );
}
async function postPortfolioBacktest(body: unknown): Promise<Response> {
  return apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function applyRebalanceBands(
  portfolios: Array<Record<string, unknown>>,
  absoluteBand: number | '',
  relativeBand: number | '',
) {
  if (absoluteBand === '' && relativeBand === '') return;
  portfolios[0].rebalanceBands = {
    enabled: true,
    absoluteBand: absoluteBand !== '' ? Number(absoluteBand) : undefined,
    relativeBand: relativeBand !== '' ? Number(relativeBand) : undefined,
  };
}
function extractFreqResult(
  json: unknown,
  freq: RebalanceFrequency,
  label: string,
  color: string,
): FreqResult {
  const data = (json as { data?: unknown })?.data ?? json;
  const p = (
    data as {
      portfolios?: Array<{
        statistics?: Record<string, number>;
        growthCurve?: Array<{ date: string; value: number }>;
      }>;
    }
  )?.portfolios?.[0];
  if (!p) throw new Error(i18n.t('No results ({{label}})', { label }));
  const stats = p.statistics ?? {};
  return {
    frequency: freq,
    label,
    color,
    cagr: stats.cagr ?? 0,
    stdev: stats.stdev ?? 0,
    maxDrawdown: stats.maxDrawdown ?? 0,
    sharpe: stats.sharpe ?? 0,
    sortino: stats.sortino ?? 0,
    growthCurve: p.growthCurve,
  };
}
async function fetchFreqResult(
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: BacktestParamsInput,
  absoluteBand: number | '',
  relativeBand: number | '',
): Promise<FreqResult> {
  const opt = REBALANCE_OPTIONS.find((o) => o.value === freq)!;
  const body = buildBacktestBody(opt.label, assets, freq, 0, params);
  applyRebalanceBands(
    body.portfolios as Array<Record<string, unknown>>,
    absoluteBand,
    relativeBand,
  );
  const res = await postPortfolioBacktest(body);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${opt.label})`);
  const json = await res.json();
  if (json.success === false)
    throw new Error(json.error || i18n.t('Backtest failed ({{label}})', { label: opt.label }));
  return extractFreqResult(json, freq, opt.label, opt.color);
}
async function fetchOffsetResult(
  offset: number,
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: BacktestParamsInput,
): Promise<{ offset: number; cagr: number }> {
  const body = buildBacktestBody(`offset-${offset}`, assets, freq, offset, params);
  const res = await postPortfolioBacktest(body);
  if (!res.ok) return { offset, cagr: 0 };
  const json = await res.json();
  return { offset, cagr: (json.data ?? json).portfolios?.[0]?.statistics?.cagr ?? 0 };
}
const TABS = [
  { key: 'scatter', labelKey: 'rebalancingSensitivity.tab.scatter' },
  { key: 'distributions', labelKey: 'rebalancingSensitivity.tab.distributions' },
  { key: 'offset', labelKey: 'rebalancingSensitivity.tab.offset' },
  { key: 'table', labelKey: 'rebalancingSensitivity.tab.table' },
];
interface RebalancingState {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  selectedFreqs: RebalanceFrequency[];
  toggleFreq: (f: RebalanceFrequency) => void;
  absoluteBand: number | '';
  setAbsoluteBand: (v: number | '') => void;
  relativeBand: number | '';
  setRelativeBand: (v: number | '') => void;
  assets: Array<{ ticker: string; weight: number }>;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isLoading: boolean;
  error: string | null;
  results: FreqResult[];
  activeTab: string;
  setActiveTab: (v: string) => void;
  offsetFreq: RebalanceFrequency;
  setOffsetFreq: (v: RebalanceFrequency) => void;
  offsetResults: Array<{ offset: number; cagr: number }>;
  isLoadingOffset: boolean;
  runSensitivity: () => Promise<void>;
  runOffsetScan: (freq: RebalanceFrequency) => Promise<void>;
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
  });
}
function createRebalancingRunners(
  s: ReturnType<typeof useRebalSetters>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
  assets: Array<{ ticker: string; weight: number }>,
) {
  const validate = (): Array<{ ticker: string; weight: number }> | string => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return i18n.t('Please add at least one ticker');
    const weightErr = validateAssetWeights(assets);
    if (weightErr) return weightErr;
    if (s.selectedFreqs.length === 0)
      return i18n.t('Please select at least one rebalancing frequency');
    return validAssets;
  };
  const runOffsetScanInner = async (
    freq: RebalanceFrequency,
    validAssets: Array<{ ticker: string; weight: number }>,
  ) => {
    s.setIsLoadingOffset(true);
    s.setOffsetResults([]);
    try {
      s.setOffsetResults(
        await Promise.all(OFFSETS.map((o) => fetchOffsetResult(o, freq, validAssets, params))),
      );
    } catch {
      s.setError(i18n.t('Rebalancing sensitivity analysis failed'));
    } finally {
      s.setIsLoadingOffset(false);
    }
  };
  const runSensitivity = async () => {
    const validAssets = validate();
    if (typeof validAssets === 'string') {
      s.setError(validAssets);
      return;
    }
    s.setIsLoading(true);
    s.setError(null);
    s.setResults([]);
    s.setOffsetResults([]);
    try {
      const all = await Promise.all(
        s.selectedFreqs.map((f) =>
          fetchFreqResult(f, validAssets, params, s.absoluteBand, s.relativeBand),
        ),
      );
      all.sort((a, b) => FREQ_ORDER[a.frequency] - FREQ_ORDER[b.frequency]);
      s.setResults(all);
      if (s.selectedFreqs.length > 0) void runOffsetScanInner(s.selectedFreqs[0], validAssets);
    } catch (e) {
      s.setError(e instanceof Error ? e.message : i18n.t('Analysis failed'));
    } finally {
      s.setIsLoading(false);
    }
  };
  const runOffsetScan = async (freq: RebalanceFrequency) => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return;
    await runOffsetScanInner(freq, validAssets);
  };
  return { runSensitivity, runOffsetScan };
}
function useRebalancingState(): RebalancingState {
  const s = useRebalSetters();
  const toggleFreq = (freq: RebalanceFrequency) =>
    s.setSelectedFreqs(
      s.selectedFreqs.includes(freq)
        ? s.selectedFreqs.filter((f) => f !== freq)
        : [...s.selectedFreqs, freq],
    );
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<{
    ticker: string;
    weight: number;
  }>([...DEFAULT_60_40_ASSETS], () => ({ ticker: '', weight: 0 }), 0);
  const params = {
    startDate: s.startDate,
    endDate: s.endDate,
    startingValue: s.startingValue,
    baseCurrency: s.baseCurrency,
    adjustForInflation: s.adjustForInflation,
  };
  const { runSensitivity, runOffsetScan } = createRebalancingRunners(s, params, assets);
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
import {
  Card,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  PortfolioLabel,
  AffixInput,
} from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { fmtPct } from '@/utils/format';
import {
  XYScatterChart,
  BarChartContent,
  SimpleLineChart,
} from '@/components/charts/sharedChartContent.js';
import { BasicParamsFields } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '@/components/form/Field';
import { RunButton } from '@/components/form/sharedFields';
function cellClassName(isBest: boolean) {
  return `border-b border-border-subtle px-3 py-2 text-right font-mono text-label font-medium ${isBest ? 'font-bold text-success' : 'text-fg'}`;
}
type NumKey = 'cagr' | 'stdev' | 'maxDrawdown' | 'sharpe' | 'sortino';
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
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    label: r.label,
    color: r.color,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown * 100,
    sortino: r.sortino,
  }));
  const distData = s.results.map((r) => ({
    name: t(`rebalancingSensitivity.freq.${r.frequency}`),
    CAGR: Number((r.cagr * 100).toFixed(2)),
    fill: r.color,
  }));
  const offsetData = s.offsetResults.map((r) => ({
    offset: `+${r.offset}d`,
    cagr: Number((r.cagr * 100).toFixed(2)),
  }));
  const offsetGrowthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  const best = {
    cagr: Math.max(...s.results.map((x) => x.cagr)),
    stdev: Math.min(...s.results.map((x) => x.stdev)),
    maxDrawdown: Math.min(...s.results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...s.results.map((x) => x.sharpe)),
    sortino: Math.max(...s.results.map((x) => x.sortino)),
  };
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Analysis failed')}: `}
      isLoading={s.isLoading}
      hasResults={s.results.length > 0}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Select rebalancing frequencies and click "Run Analysis"')}
    >
      <Card className="p-5">
        <Tabs value={s.activeTab} onValueChange={s.setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="scatter">
            <XYScatterChart
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
          </TabsContent>
          <TabsContent value="distributions">
            <BarChartContent
              data={distData}
              seriesNames={['CAGR']}
              xDataKey="name"
              height={400}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
          </TabsContent>
          <TabsContent value="offset">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-body text-fg-tertiary">{t('Frequency')}:</span>
              <Select
                value={s.offsetFreq}
                onValueChange={(v) => {
                  const freq = v as RebalanceFrequency;
                  s.setOffsetFreq(freq);
                  void s.runOffsetScan(freq);
                }}
              >
                <SelectTrigger className="h-9 w-32" aria-label={t('Frequency')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {REBALANCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(`rebalancingSensitivity.freq.${o.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {s.isLoadingOffset && <Loader2 className="size-4 animate-spin text-fg-tertiary" />}
            </div>
            <BarChartContent
              data={offsetData.map((d) => ({ offset: d.offset, CAGR: d.cagr }))}
              seriesNames={['CAGR']}
              xDataKey="offset"
              height={250}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
            {offsetGrowthData.length > 0 && (
              <SimpleLineChart
                data={offsetGrowthData.map((d) => ({ date: d.date, value: d.value }))}
                series={[{ dataKey: 'value', color: getPortfolioColor(0) }]}
                xDataKey="date"
                height={250}
                xTickFormatter={(v) => String(v).slice(0, 7)}
                yTickFormatter={(v) => v.toLocaleString()}
                showLegend={false}
              />
            )}
          </TabsContent>
          <TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-input-bg">
                    <th className="border-b-2 border-border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
                      {t('Frequency')}
                    </th>
                    {TABLE_COLS.map(([label]) => (
                      <th
                        key={label}
                        className="border-b-2 border-border-subtle px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary"
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
                        <PortfolioLabel color={r.color} name={r.label} />
                      </td>
                      {TABLE_COLS.map(([, key, fmt]) => {
                        const val = r[key] as number;
                        return (
                          <td key={key} className={cellClassName(val === best[key])}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </ResultsShell>
  );
}
function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  const bandField = (
    label: string,
    value: number | '',
    onChange: (v: number | '') => void,
    max: number,
  ) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <AffixInput
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
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
            const selected = s.selectedFreqs.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-semibold transition-colors"
                style={{
                  borderColor: selected ? opt.color : 'hsl(var(--border))',
                  backgroundColor: selected
                    ? `color-mix(in srgb, ${opt.color} 10%, transparent)`
                    : 'transparent',
                  color: selected ? opt.color : 'hsl(var(--fg-tertiary))',
                }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => s.toggleFreq(opt.value)}
                />
                <PortfolioLabel
                  color={opt.color}
                  name={t(`rebalancingSensitivity.freq.${opt.value}`)}
                />
              </label>
            );
          })}
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bandField(t('Absolute Deviation Band'), s.absoluteBand, s.setAbsoluteBand, 50)}
        {bandField(t('Relative Deviation Band'), s.relativeBand, s.setRelativeBand, 100)}
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
    {
      titleKey: 'analysis.seoAnalyzable',
      descKey: 'rebalancingSensitivity.seo.analyzableDesc',
    },
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
