/* eslint-disable @typescript-eslint/no-explicit-any -- 动态结果需 any */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play, TrendingDown, TrendingUp } from 'lucide-react';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import * as U from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { BasicParamsFields } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import * as F from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import type { TFunction } from 'i18next';
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
type LumpSumAsset = { ticker: string; weight: number };
type CompareResult = {
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
};
const toResult = (p: any, label: string): CompareResult => {
  const c = p.growthCurve ?? [],
    s = p.statistics as any;
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
    finalValue: c.length ? c[c.length - 1].value : 0,
    growthCurve: c,
  };
};
const WIN_T =
  "has a higher final value ({{lsValue}} vs {{dcaValue}}), exceeding by {{pct}}%. However, Lump Sum's max drawdown ({{lsMdd}}) is typically larger than DCA's ({{dcaMdd}}), bearing greater psychological pressure in falling markets.";
const LOSE_T =
  'has a higher final value ({{dcaValue}} vs {{lsValue}}), exceeding by {{pct}}%. DCA reduces average cost through batch purchases, achieving better returns in falling markets.';
const LUMP_WARN =
  'Although Lump Sum performs better in this historical period, this is a hindsight result. Lump Sum carries greater timing risk at entry; entering at market peaks may cause significant losses. While DCA has a lower final value, it reduces timing risk through staggered entries, suitable for investors with lower risk tolerance.';
const DCA_WARN =
  'DCA performs better in this historical period, indicating the market experienced significant volatility or declines during this time. DCA reduces average cost through batch purchases, but if the market continues to rise, Lump Sum typically achieves higher returns. Investment decisions should consider personal risk tolerance and market judgment.';
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
    const v = assets.filter((a) => a.ticker.trim() !== '');
    if (!v.length) return setError(t('Please add at least one ticker'));
    const e = validateAssetWeights(assets);
    if (e) return setError(e);
    s.setResults([]);
    run(async () => {
      const base = {
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
      const def = {
        name: 'portfolio',
        assets: v,
        rebalanceFrequency: 'quarterly' as const,
        rebalanceOffset: 0,
        drag: 0,
      };
      const lumpBody = { portfolios: [{ ...def, name: 'lumpSum' }], parameters: { ...base } };
      const dcaBody = {
        portfolios: [{ ...def, name: 'dca' }],
        parameters: {
          ...base,
          startingValue: 0,
          cashflowLegs: [
            {
              id: `dca-${Date.now()}`,
              amount: Math.round(s.startingValue / s.dcaPeriods),
              type: 'contribution' as const,
              frequency: (s.dcaFrequency === 'monthly' ? 'monthly' : 'quarterly') as DcaFrequency,
            },
          ],
        },
      };
      const post = (b: unknown) =>
        apiFetch('/api/v1/backtest/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        });
      const [lr, dr] = await Promise.all([post(lumpBody), post(dcaBody)]);
      if (!lr.ok) throw new Error(`${i18n.t('Lump sum backtest failed')}: HTTP ${lr.status}`);
      if (!dr.ok) throw new Error(`${i18n.t('DCA backtest failed')}: HTTP ${dr.status}`);
      const lj = await lr.json(),
        dj = await dr.json();
      if (lj.success === false) throw new Error(lj.error || i18n.t('Lump sum backtest failed'));
      if (dj.success === false) throw new Error(dj.error || i18n.t('DCA backtest failed'));
      const lp = (lj.data ?? lj).portfolios?.[0],
        dp = (dj.data ?? dj).portfolios?.[0];
      if (!lp) throw new Error(i18n.t('Lump sum has no result'));
      if (!dp) throw new Error(i18n.t('DCA has no result'));
      s.setResults([toResult(lp, i18n.t('Lump Sum')), toResult(dp, i18n.t('DCA'))]);
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
const REQ = new Set(['finalValue', 'cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino']);
function StatsTable({
  results: r,
  fmtPct: fp,
  fmtNum: fn,
  fmtMoney: fm,
}: {
  results: CompareResult[];
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
  const { t } = useTranslation();
  const fv = (k: string, v: number) =>
    k === 'finalValue'
      ? fm(v)
      : k === 'maxDrawdownDuration'
        ? t('{{count}} days', { count: v })
        : ['cagr', 'stdev', 'maxDrawdown'].includes(k)
          ? fp(v)
          : fn(v);
  const cols: SimpleTableColumn<(typeof STATS_ROWS)[number]>[] = [
    {
      key: 'metric',
      label: t('Metric'),
      render: (x) => <span className="text-fg-secondary">{t(x.label)}</span>,
    },
    ...r.map((x, i) => ({
      key: x.label,
      label: <U.PortfolioLabel color={getPortfolioColor(i)} name={x.label} />,
      align: 'right' as const,
      render: (row: (typeof STATS_ROWS)[number]) =>
        x[row.key] != null ? fv(row.key, x[row.key] as number) : '—',
    })),
  ];
  return (
    <SimpleTable
      columns={cols}
      data={STATS_ROWS.filter((x) => r.some((y) => y[x.key] != null) || REQ.has(x.key))}
      rowKey={(x) => x.key}
    />
  );
}
function ConclusionAnalysis({
  ls,
  dca,
  fmtPct: fp,
  fmtMoney: fm,
}: {
  ls: CompareResult;
  dca: CompareResult;
  fmtPct: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
  const { t } = useTranslation();
  const win = ls.finalValue > dca.finalValue,
    diff = Math.abs(ls.finalValue - dca.finalValue),
    pct = ls.finalValue ? (diff / ls.finalValue) * 100 : 0,
    mdd = Math.abs(ls.maxDrawdown - dca.maxDrawdown);
  const cards = [
    {
      label: t('Winning Strategy'),
      val: t(win ? 'Lump Sum' : 'DCA'),
      color: getPortfolioColor(win ? 0 : 1),
    },
    { label: t('Final Value Difference'), val: `${fm(diff)} (${pct.toFixed(1)}%)` },
    { label: t('Max Drawdown Difference'), val: fp(mdd) },
  ];
  return (
    <div className="mb-5 rounded-lg bg-input-bg p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {win ? (
          <TrendingUp className="size-5 text-success" />
        ) : (
          <TrendingDown className="size-5 text-brand" />
        )}
        <span className="text-body font-semibold text-fg">{t('Conclusion Analysis')}</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg bg-elevated p-3">
            <div className="mb-1 text-caption text-fg-tertiary">{c.label}</div>
            <div
              className="font-mono text-body font-semibold"
              style={{ color: c.color ?? 'hsl(var(--fg-secondary))' }}
            >
              {c.val}
            </div>
          </div>
        ))}
      </div>
      <div className="text-body leading-relaxed text-fg-secondary">
        {t('In the selected time range, ')}
        <strong style={{ color: getPortfolioColor(win ? 0 : 1) }}>
          {t(win ? 'Lump Sum' : 'DCA')}
        </strong>
        {t(
          win ? WIN_T : LOSE_T,
          win
            ? {
                lsValue: fm(ls.finalValue),
                dcaValue: fm(dca.finalValue),
                pct: pct.toFixed(1),
                lsMdd: fp(ls.maxDrawdown),
                dcaMdd: fp(dca.maxDrawdown),
              }
            : { dcaValue: fm(dca.finalValue), lsValue: fm(ls.finalValue), pct: pct.toFixed(1) },
        )}
      </div>
    </div>
  );
}
function LumpSumVsDCAParamsForm({ state: s }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsFields
        startDate={s.startDate}
        endDate={s.endDate}
        startingValue={s.startingValue}
        baseCurrency={s.baseCurrency}
        adjustForInflation={s.adjustForInflation}
        onChange={(f, v) => {
          const m: Record<string, (x: never) => void> = {
            startDate: s.setStartDate,
            endDate: s.setEndDate,
            startingValue: s.setStartingValue,
            baseCurrency: s.setBaseCurrency,
            adjustForInflation: s.setAdjustForInflation,
          };
          m[f]?.(v as never);
        }}
      />
      <div className="mt-4">
        <div className="mb-1.5 text-caption font-semibold text-fg-tertiary">
          {t('DCA Parameters')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="lumpsum-dca-frequency">{t('DCA Frequency')}</FieldLabel>
            <U.Select
              value={s.dcaFrequency}
              onValueChange={(v) => s.setDcaFrequency(v as DcaFrequency)}
            >
              <U.SelectTrigger id="lumpsum-dca-frequency">
                <U.SelectValue />
              </U.SelectTrigger>
              <U.SelectContent position="popper" sideOffset={4}>
                <U.SelectItem value="monthly">{t('Monthly')}</U.SelectItem>
                <U.SelectItem value="quarterly">{t('Quarterly')}</U.SelectItem>
              </U.SelectContent>
            </U.Select>
          </Field>
          <Field>
            <FieldLabel>{t('DCA Periods')}</FieldLabel>
            <U.AffixInput
              type="number"
              value={s.dcaPeriods}
              onChange={(e) => s.setDcaPeriods(Number(e.target.value) || 1)}
              min={1}
              max={360}
              suffix={t('periods')}
            />
          </Field>
          <Field>
            <FieldLabel>{t('Per-Period Amount')}</FieldLabel>
            <U.AffixInput
              type="text"
              prefix={s.baseCurrency === 'usd' ? '$' : '¥'}
              className="opacity-70"
              value={Math.round(s.startingValue / s.dcaPeriods).toLocaleString()}
              readOnly
            />
          </Field>
        </div>
      </div>
      <PortfolioEditor
        singleMode
        assets={s.assets}
        totalWeight={s.totalWeight}
        onAdd={s.addAsset}
        onRemove={s.removeAsset}
        onUpdate={s.updateAsset}
      />
      <U.LoadingButton
        isLoading={s.isLoading}
        onClick={s.runComparison}
        loadingText={t('Comparing...')}
        className="w-full"
      >
        <Play className="size-4" />
        {t('Start Comparison')}
      </U.LoadingButton>
    </div>
  );
}
function LumpSumVsDCAResults({ state: s }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  const fm = (v: number) =>
    `${s.baseCurrency === 'usd' ? '$' : '¥'}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const chartData = useMemo(
    () =>
      F.mergeRowsByDate(
        s.results.map((r) => ({
          key: r.label,
          rows: r.growthCurve,
          value: (p: { date: string; value: number }) => p.value,
        })),
      ),
    [s.results],
  );
  if (s.error)
    return (
      <U.Card className="mb-3 p-6 text-center text-danger">
        {t('Comparison failed')}: {s.error}
      </U.Card>
    );
  if (s.results.length !== 2) return null;
  const win = s.results[0].finalValue > s.results[1].finalValue;
  return (
    <U.Card className="p-5">
      <ConclusionAnalysis ls={s.results[0]} dca={s.results[1]} fmtPct={F.fmtPct} fmtMoney={fm} />
      <div className="mb-3 text-body font-semibold text-fg">{t('Growth Curve Comparison')}</div>
      <TimeSeriesLineChart
        data={chartData}
        series={s.results.map((r, i) => ({
          dataKey: r.label,
          legendName: r.label,
          color: getPortfolioColor(i),
        }))}
        tooltipValueFormatter={(v: number) => [fm(v), '']}
      />
      <div className="mb-3 mt-6 text-body font-semibold text-fg">{t('Statistics Comparison')}</div>
      <StatsTable results={s.results} fmtPct={F.fmtPct} fmtNum={F.fmtNum} fmtMoney={fm} />
      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-input-bg p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-body leading-relaxed text-fg-tertiary">
          <strong className="text-fg-secondary">{t('Risk Warning:')}</strong>
          {win ? t(LUMP_WARN) : t(DCA_WARN)}
          {t('Historical performance does not guarantee future returns.')}
        </div>
      </div>
    </U.Card>
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
