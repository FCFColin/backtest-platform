import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import {
  AffixInput,
  Card,
  LoadingButton,
  PortfolioLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { BasicParamsFields } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { fmtNum, fmtPct, mergeRowsByDate } from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import type { TFunction } from 'i18next';
import type { Statistics } from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import { useAssetList, useAsyncAction, useSetterState } from '@/hooks/miscHooks.js';
import i18n from '../../i18n/index.js';
import {
  DEFAULT_60_40_ASSETS,
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
type DcaFrequency = 'monthly' | 'quarterly';
interface CompareResult {
  label: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar?: number;
  maxDrawdownDuration?: number;
  ulcerIndex?: number;
  finalValue: number;
  growthCurve: Array<{ date: string; value: number }>;
}
interface BacktestPortfolioResponse {
  growthCurve?: Array<{ date: string; value: number }>;
  statistics?: Statistics;
}
type LumpSumAsset = { ticker: string; weight: number };
function toResult(p: BacktestPortfolioResponse, label: string): CompareResult {
  const curve = p.growthCurve ?? [];
  const s = p.statistics as Statistics;
  return {
    label,
    cagr: s?.cagr ?? 0,
    stdev: s?.stdev ?? 0,
    maxDrawdown: s?.maxDrawdown ?? 0,
    sharpe: s?.sharpe ?? 0,
    sortino: s?.sortino ?? 0,
    calmar: s?.calmar,
    maxDrawdownDuration: s?.maxDrawdownDuration,
    ulcerIndex: s?.ulcerIndex,
    finalValue: curve.length > 0 ? curve[curve.length - 1].value : 0,
    growthCurve: curve,
  };
}
function useLumpSumVsDCAState(t: TFunction) {
  const s = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    startingValue: 120000,
    baseCurrency: 'usd' as 'usd' | 'cny',
    adjustForInflation: false,
    dcaFrequency: 'monthly' as DcaFrequency,
    dcaPeriods: 12,
    results: [] as CompareResult[],
  });
  const { isLoading, error, run, setError } = useAsyncAction();
  const { assets, setAssets, addAsset, removeAsset, updateAsset, totalWeight } =
    useAssetList<LumpSumAsset>([...DEFAULT_60_40_ASSETS], () => ({ ticker: '', weight: 0 }), 0);
  const runComparison = () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError(t('Please add at least one ticker'));
      return;
    }
    const weightErr = validateAssetWeights(assets);
    if (weightErr) {
      setError(weightErr);
      return;
    }
    s.setResults([]);
    run(async () => {
      const baseParams = {
        startDate: s.startDate,
        endDate: s.endDate,
        startingValue: s.startingValue,
        baseCurrency: s.baseCurrency,
        adjustForInflation: s.adjustForInflation,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
        cashflowLegs: [],
        oneTimeCashflows: [],
      };
      const portfolioDef = {
        name: 'portfolio',
        assets: validAssets,
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
      };
      const lumpSumBody = {
        portfolios: [{ ...portfolioDef, name: 'lumpSum' }],
        parameters: { ...baseParams, startingValue: s.startingValue },
      };
      const dcaBody = {
        portfolios: [{ ...portfolioDef, name: 'dca' }],
        parameters: {
          ...baseParams,
          startingValue: 0,
          cashflowLegs: [
            {
              id: `dca-${Date.now()}`,
              amount: Math.round(s.startingValue / s.dcaPeriods),
              type: 'contribution' as const,
              frequency:
                s.dcaFrequency === 'monthly' ? ('monthly' as const) : ('quarterly' as const),
            },
          ],
        },
      };
      const post = (body: unknown) =>
        apiFetch('/api/v1/backtest/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      const [lumpSumRes, dcaRes] = await Promise.all([post(lumpSumBody), post(dcaBody)]);
      if (!lumpSumRes.ok)
        throw new Error(`${i18n.t('Lump sum backtest failed')}: HTTP ${lumpSumRes.status}`);
      if (!dcaRes.ok) throw new Error(`${i18n.t('DCA backtest failed')}: HTTP ${dcaRes.status}`);
      const lumpSumJson = await lumpSumRes.json();
      const dcaJson = await dcaRes.json();
      if (lumpSumJson.success === false)
        throw new Error(lumpSumJson.error || i18n.t('Lump sum backtest failed'));
      if (dcaJson.success === false)
        throw new Error(dcaJson.error || i18n.t('DCA backtest failed'));
      const lumpSumP = (lumpSumJson.data ?? lumpSumJson).portfolios?.[0];
      const dcaP = (dcaJson.data ?? dcaJson).portfolios?.[0];
      if (!lumpSumP) throw new Error(i18n.t('Lump sum has no result'));
      if (!dcaP) throw new Error(i18n.t('DCA has no result'));
      s.setResults([toResult(lumpSumP, i18n.t('Lump Sum')), toResult(dcaP, i18n.t('DCA'))]);
    });
  };
  return {
    ...s,
    isLoading,
    error,
    run,
    setError,
    assets,
    setAssets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    runComparison,
  };
}
type LumpSumVsDCAState = ReturnType<typeof useLumpSumVsDCAState>;
function GrowthCurveChart({
  results,
  fmtMoney,
}: {
  results: CompareResult[];
  fmtMoney: (v: number) => string;
}) {
  const chartData = useMemo(
    () =>
      mergeRowsByDate(
        results.map((r) => ({
          key: r.label,
          rows: r.growthCurve,
          value: (p: { date: string; value: number }) => p.value,
        })),
      ),
    [results],
  );
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={results.map((r, i) => ({
        dataKey: r.label,
        legendName: r.label,
        color: getPortfolioColor(i),
      }))}
      tooltipValueFormatter={(v: number) => [fmtMoney(v), '']}
    />
  );
}
const STATS_ROWS = [
  { key: 'finalValue' as const, label: 'lumpSumDca.stats.finalValue' },
  { key: 'cagr' as const, label: 'stats.cagr' },
  { key: 'stdev' as const, label: 'backtest.stdev' },
  { key: 'maxDrawdown' as const, label: 'Max Drawdown' },
  { key: 'sharpe' as const, label: 'backtest.sharpeRatio' },
  { key: 'sortino' as const, label: 'lumpSumDca.stats.sortino' },
  { key: 'calmar' as const, label: 'lumpSumDca.stats.calmar' },
  { key: 'maxDrawdownDuration' as const, label: 'analysis.maxDrawdownDuration' },
  { key: 'ulcerIndex' as const, label: 'analysis.ulcerIndex' },
];
const REQUIRED_KEYS = new Set(['finalValue', 'cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino']);
type FmtFns = {
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
};
function StatsTable({ results, fmtPct, fmtNum, fmtMoney }: FmtFns & { results: CompareResult[] }) {
  const { t } = useTranslation();
  const fmtVal = (key: string, v: number) => {
    if (key === 'finalValue') return fmtMoney(v);
    if (key === 'maxDrawdownDuration') return t('{{count}} days', { count: v });
    if (['cagr', 'stdev', 'maxDrawdown'].includes(key)) return fmtPct(v);
    return fmtNum(v);
  };
  const columns: SimpleTableColumn<(typeof STATS_ROWS)[number]>[] = [
    {
      key: 'metric',
      label: t('Metric'),
      render: (row) => <span className="text-fg-secondary">{t(row.label)}</span>,
    },
    ...results.map((r, idx) => ({
      key: r.label,
      label: <PortfolioLabel color={getPortfolioColor(idx)} name={r.label} />,
      align: 'right' as const,
      render: (row: (typeof STATS_ROWS)[number]) =>
        r[row.key] != null ? fmtVal(row.key, r[row.key] as number) : '\u2014',
    })),
  ];
  return (
    <SimpleTable
      columns={columns}
      data={STATS_ROWS.filter(
        (row) => results.some((res) => res[row.key] != null) || REQUIRED_KEYS.has(row.key),
      )}
      rowKey={(row) => row.key}
    />
  );
}
function ConclusionAnalysis({
  ls,
  dca,
  fmtPct,
  fmtMoney,
}: { ls: CompareResult; dca: CompareResult } & Pick<FmtFns, 'fmtPct' | 'fmtMoney'>) {
  const { t } = useTranslation();
  const lsWins = ls.finalValue > dca.finalValue;
  const finalValueDiff = Math.abs(ls.finalValue - dca.finalValue);
  const finalValueDiffPct = ls.finalValue > 0 ? (finalValueDiff / ls.finalValue) * 100 : 0;
  const mddDiff = Math.abs(ls.maxDrawdown - dca.maxDrawdown);
  return (
    <div className="mb-5 rounded-lg bg-input-bg p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {lsWins ? (
          <TrendingUp className="size-5 text-success" />
        ) : (
          <TrendingDown className="size-5 text-brand" />
        )}
        <span className="text-body font-semibold text-fg">{t('Conclusion Analysis')}</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-elevated p-3">
          <div className="mb-1 text-caption text-fg-tertiary">{t('Winning Strategy')}</div>
          <div
            className="font-mono text-body font-semibold"
            style={{ color: lsWins ? getPortfolioColor(0) : getPortfolioColor(1) }}
          >
            {lsWins ? t('Lump Sum') : t('DCA')}
          </div>
        </div>
        <div className="rounded-lg bg-elevated p-3">
          <div className="mb-1 text-caption text-fg-tertiary">{t('Final Value Difference')}</div>
          <div
            className="font-mono text-body font-semibold"
            style={{ color: 'hsl(var(--fg-secondary))' }}
          >
            {fmtMoney(finalValueDiff)}{' '}
            <span className="text-caption text-fg-tertiary">({finalValueDiffPct.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="rounded-lg bg-elevated p-3">
          <div className="mb-1 text-caption text-fg-tertiary">{t('Max Drawdown Difference')}</div>
          <div
            className="font-mono text-body font-semibold"
            style={{ color: 'hsl(var(--fg-secondary))' }}
          >
            {fmtPct(mddDiff)}
          </div>
        </div>
      </div>
      <div className="text-body leading-relaxed text-fg-secondary">
        {t('In the selected time range, ')}
        <strong style={{ color: getPortfolioColor(lsWins ? 0 : 1) }}>
          {t(lsWins ? 'Lump Sum' : 'DCA')}
        </strong>
        {t(
          lsWins
            ? "has a higher final value ({{lsValue}} vs {{dcaValue}}), exceeding by {{pct}}%. However, Lump Sum's max drawdown ({{lsMdd}}) is typically larger than DCA's ({{dcaMdd}}), bearing greater psychological pressure in falling markets."
            : 'has a higher final value ({{dcaValue}} vs {{lsValue}}), exceeding by {{pct}}%. DCA reduces average cost through batch purchases, achieving better returns in falling markets.',
          lsWins
            ? {
                lsValue: fmtMoney(ls.finalValue),
                dcaValue: fmtMoney(dca.finalValue),
                pct: finalValueDiffPct.toFixed(1),
                lsMdd: fmtPct(ls.maxDrawdown),
                dcaMdd: fmtPct(dca.maxDrawdown),
              }
            : {
                dcaValue: fmtMoney(dca.finalValue),
                lsValue: fmtMoney(ls.finalValue),
                pct: finalValueDiffPct.toFixed(1),
              },
        )}
      </div>
    </div>
  );
}
function LumpSumVsDCAParamsForm({ state }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsFields
        startDate={state.startDate}
        endDate={state.endDate}
        startingValue={state.startingValue}
        baseCurrency={state.baseCurrency}
        adjustForInflation={state.adjustForInflation}
        onChange={(field, value) => {
          const setters: Record<string, (v: never) => void> = {
            startDate: state.setStartDate,
            endDate: state.setEndDate,
            startingValue: state.setStartingValue,
            baseCurrency: state.setBaseCurrency,
            adjustForInflation: state.setAdjustForInflation,
          };
          setters[field]?.(value as never);
        }}
      />
      <div className="mt-4">
        <div className="mb-1.5 text-caption font-semibold text-fg-tertiary">
          {t('DCA Parameters')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="lumpsum-dca-frequency">{t('DCA Frequency')}</FieldLabel>
            <Select
              value={state.dcaFrequency}
              onValueChange={(v) => state.setDcaFrequency(v as DcaFrequency)}
            >
              <SelectTrigger id="lumpsum-dca-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="monthly">{t('Monthly')}</SelectItem>
                <SelectItem value="quarterly">{t('Quarterly')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t('DCA Periods')}</FieldLabel>
            <AffixInput
              type="number"
              value={state.dcaPeriods}
              onChange={(e) => state.setDcaPeriods(Number(e.target.value) || 1)}
              min={1}
              max={360}
              suffix={t('periods')}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Per-Period Amount')}</FieldLabel>
            <AffixInput
              type="text"
              prefix={state.baseCurrency === 'usd' ? '$' : '¥'}
              className="opacity-70"
              value={Math.round(state.startingValue / state.dcaPeriods).toLocaleString()}
              readOnly
            />
          </Field>
        </div>
      </div>
      <PortfolioEditor
        singleMode
        assets={state.assets}
        totalWeight={state.totalWeight}
        onAdd={state.addAsset}
        onRemove={state.removeAsset}
        onUpdate={state.updateAsset}
      />
      <LoadingButton
        isLoading={state.isLoading}
        onClick={state.runComparison}
        loadingText={t('Comparing...')}
        className="w-full"
      >
        <Play className="size-4" />
        {t('Start Comparison')}
      </LoadingButton>
    </div>
  );
}
function LumpSumVsDCAResults({ state }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  const fmtMoney = (v: number) =>
    state.baseCurrency === 'usd'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (state.error) {
    return (
      <Card className="mb-3 p-6 text-center text-danger">
        {t('Comparison failed')}: {state.error}
      </Card>
    );
  }
  if (state.results.length !== 2) return null;
  const lsWins = state.results[0].finalValue > state.results[1].finalValue;
  return (
    <Card className="p-5">
      <ConclusionAnalysis
        ls={state.results[0]}
        dca={state.results[1]}
        fmtPct={fmtPct}
        fmtMoney={fmtMoney}
      />
      <div className="mb-3 text-body font-semibold text-fg">{t('Growth Curve Comparison')}</div>
      <GrowthCurveChart results={state.results} fmtMoney={fmtMoney} />
      <div className="mb-3 mt-6 text-body font-semibold text-fg">{t('Statistics Comparison')}</div>
      <StatsTable results={state.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-input-bg p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-body leading-relaxed text-fg-tertiary">
          <strong className="text-fg-secondary">{t('Risk Warning:')}</strong>
          {lsWins
            ? t(
                'Although Lump Sum performs better in this historical period, this is a hindsight result. Lump Sum carries greater timing risk at entry; entering at market peaks may cause significant losses. While DCA has a lower final value, it reduces timing risk through staggered entries, suitable for investors with lower risk tolerance.',
              )
            : t(
                'DCA performs better in this historical period, indicating the market experienced significant volatility or declines during this time. DCA reduces average cost through batch purchases, but if the market continues to rise, Lump Sum typically achieves higher returns. Investment decisions should consider personal risk tolerance and market judgment.',
              )}
          {t('Historical performance does not guarantee future returns.')}
        </div>
      </div>
    </Card>
  );
}
const config: ComputeToolConfig<LumpSumVsDCAState> = {
  titleKey: 'lumpSumDca.title',
  seoDescKey: 'lumpSumDca.seo.desc',
  seoFeatures: [
    { titleKey: 'lumpSumDca.seo.configurableTitle', descKey: 'lumpSumDca.seo.configurableDesc' },
    { titleKey: 'lumpSumDca.seo.strategyTitle', descKey: 'lumpSumDca.seo.strategyDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.rebalancingSensitivity', href: '/rebalancing-sensitivity' },
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
  ],
  params: ({ state }) => <LumpSumVsDCAParamsForm state={state} />,
  results: ({ state }) => <LumpSumVsDCAResults state={state} />,
};
export default function LumpSumVsDCAPage() {
  const { t } = useTranslation();
  const s = useLumpSumVsDCAState(t);
  return <ComputeToolShell config={config} state={s} />;
}
