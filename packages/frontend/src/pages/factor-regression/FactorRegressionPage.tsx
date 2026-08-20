import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtNum } from '@/utils/format';
import { cn } from '@/lib/utils';
import { useAsyncAction, useAssetList, useSetterState } from '@/hooks/miscHooks.js';
import { useToastStore } from '@/store/toastStore';
import { Card, PortfolioLabel, badgeVariants } from '@/components/ui/uiComponents';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { BarChartContent } from '@/components/charts/sharedChartContent.js';
import { CollapsibleSection, StatCard } from '@/components/cards.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { DateField, RunButton } from '@/components/form/sharedFields';
import {
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
  DEFAULT_60_40_ASSETS,
} from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { apiPostJSON, apiGetJSON } from '../../utils/apiClient.js';
import i18n from '../../i18n/index.js';
interface FFDataPoint {
  date: string;
  mktRf: number;
  smb: number;
  hml: number;
  rf: number;
}
interface FactorRegressionResult {
  alpha: number;
  beta: number;
  smb: number;
  hml: number;
  rSquared: number;
  residuals: number[];
}
interface AssetItem {
  ticker: string;
  weight: number;
}
const FACTOR_OPTIONS = [
  ['mktRF', 'factorRegression.factors.mktRf', 'factorRegression.factors.mktRfDesc'],
  ['smb', 'factorRegression.factors.smb', 'factorRegression.factors.smbDesc'],
  ['hml', 'factorRegression.factors.hml', 'factorRegression.factors.hmlDesc'],
] as const;
const FACTOR_COLORS = {
  alpha: getPortfolioColor(0),
  beta: getPortfolioColor(1),
  smb: getPortfolioColor(2),
  hml: getPortfolioColor(3),
} as const;
let ffCache: FFDataPoint[] | null = null;
async function loadFF(): Promise<FFDataPoint[]> {
  if (ffCache) return ffCache;
  const rows = await apiGetJSON<Array<Record<string, unknown>>>(
    '/api/v1/data/factors',
    i18n.t('Failed to load Fama-French factor data'),
  );
  ffCache = rows.map((r) => ({
    date: String(r.date ?? ''),
    mktRf:
      Number((r as Record<string, unknown>)['mktRf'] ?? (r as Record<string, unknown>)['mkt_rf']) ||
      0,
    smb: Number(r.smb) || 0,
    hml: Number(r.hml) || 0,
    rf: Number(r.rf) || 0,
  }));
  return ffCache;
}
async function fetchRegression(p: {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
}): Promise<FactorRegressionResult> {
  const { validAssets: a, startDate: s, endDate: e, selectedFactors: f } = p;
  const tickers = a.map((x) => x.ticker);
  const data = await apiPostJSON<{
    tickers?: Array<{
      ticker: string;
      growthCurve?: Array<{ date: string }>;
      dailyReturns?: number[];
    }>;
  }>(
    '/api/v1/backtest/analysis',
    {
      tickers,
      parameters: {
        startDate: s,
        endDate: e,
        startingValue: 10000,
        baseCurrency: 'usd',
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
        cashflowLegs: [],
        oneTimeCashflows: [],
      },
    },
    i18n.t('Failed to fetch market data'),
  );
  const tks = (data.tickers ?? []).reduce<
    Array<{ ticker: string; dailyReturns: number[]; dates: string[] }>
  >((acc, tk) => {
    const gc = tk.growthCurve ?? [],
      dr = tk.dailyReturns ?? [];
    if (gc.length < 2 || dr.length < 1) return acc;
    acc.push({ ticker: tk.ticker, dailyReturns: dr, dates: gc.slice(1).map((x) => x.date) });
    return acc;
  }, []);
  if (tks.length === 0) throw new Error(i18n.t('Insufficient price data available'));
  const tot = a.reduce((sum, x) => sum + (x.weight || 0), 0);
  const w = new Map(a.map((x) => [x.ticker, (x.weight || 0) / tot]));
  const longest = tks.reduce((x, y) => (x.dailyReturns.length > y.dailyReturns.length ? x : y));
  const m = new Map<string, number>();
  for (let i = 0; i < longest.dailyReturns.length; i++) {
    const d = longest.dates[i];
    if (!d) continue;
    const k = d.slice(0, 7);
    let r = 0;
    for (const tr of tks) {
      const idx = tr.dates.indexOf(d);
      if (idx >= 0) r += tr.dailyReturns[idx] * (w.get(tr.ticker) ?? 0);
    }
    m.set(k, (m.get(k) ?? 1) * (1 + r));
  }
  const monthlyReturns = Array.from(m.entries())
    .map(([date, v]) => ({ date, value: v - 1 }))
    .sort((x, y) => x.date.localeCompare(y.date));
  if (monthlyReturns.length < 3)
    throw new Error(i18n.t('Insufficient data points (at least 3 months required)'));
  const ff = await loadFF();
  return apiPostJSON<FactorRegressionResult>(
    '/api/v1/analysis/factor-regression',
    { monthlyReturns, ffData: ff, factors: f, startDate: s, endDate: e },
    i18n.t('Factor regression computation failed'),
  );
}
function useFactorRegressionState(t: TFunction) {
  const s = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    selectedFactors: ['mktRF', 'smb', 'hml'] as string[],
    result: null as FactorRegressionResult | null,
  });
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<AssetItem>(
    [...DEFAULT_60_40_ASSETS],
    () => ({ ticker: '', weight: 0 }),
    0,
  );
  const { isLoading, error, run, setError } = useAsyncAction();
  const toggleFactor = (k: string) =>
    s.setSelectedFactors(
      s.selectedFactors.includes(k)
        ? s.selectedFactors.filter((x) => x !== k)
        : [...s.selectedFactors, k],
    );
  const runRegression = () => {
    const v = assets.filter((x) => x.ticker.trim() !== '');
    if (v.length === 0) return setError(t('Please add at least one ticker'));
    const e = validateAssetWeights(assets);
    if (e) return setError(e);
    if (s.selectedFactors.length === 0) return setError(t('Please select at least one factor'));
    s.setResult(null);
    run(async () => {
      try {
        s.setResult(
          await fetchRegression({
            validAssets: v,
            startDate: s.startDate,
            endDate: s.endDate,
            selectedFactors: s.selectedFactors,
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('Regression computation failed');
        setError(msg);
        useToastStore.getState().addToast('error', msg);
      }
    });
  };
  return {
    ...s,
    assets,
    totalWeight,
    isLoading,
    error,
    runRegression,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  };
}
function FactorRegressionParamsPanel({
  state: s,
}: {
  state: ReturnType<typeof useFactorRegressionState>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field className="col-span-full">
        <AllHistoryCheckbox
          startDate={s.startDate}
          endDate={s.endDate}
          onStartDateChange={s.setStartDate}
          onEndDateChange={s.setEndDate}
          label={t('All History')}
        />
      </Field>
      <DateField
        id="fr-start-date"
        label={t('Start Date')}
        value={s.startDate}
        onChange={s.setStartDate}
      />
      <DateField id="fr-end-date" label={t('End Date')} value={s.endDate} onChange={s.setEndDate} />
      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('Factor Selection (Multi-select)')}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {FACTOR_OPTIONS.map(([k, l, d]) => {
              const a = s.selectedFactors.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => s.toggleFactor(k)}
                  aria-pressed={a}
                  className={badgeVariants({
                    variant: a ? 'asset' : 'secondary',
                    size: 'sm',
                    className: 'cursor-pointer',
                  })}
                >
                  {t(l)}
                  <span className="font-normal opacity-70">({t(d)})</span>
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <div className="col-span-full">
        <PortfolioEditor
          singleMode
          assets={s.assets}
          totalWeight={s.totalWeight}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={s.updateAsset}
        />
      </div>
      <div className="col-span-full">
        <RunButton
          isLoading={s.isLoading}
          onClick={s.runRegression}
          label={t('Run Analysis')}
          loadingLabel={t('Running regression...')}
        />
      </div>
    </div>
  );
}
function RegressionResultTable({
  result: r,
  selectedFactors: f,
}: {
  result: FactorRegressionResult;
  selectedFactors: string[];
}) {
  const { t } = useTranslation();
  const C = FACTOR_COLORS;
  const d = {
    alpha: t(
      "Portfolio excess return (annualized); positive means outperforming the factor model's expectation",
    ),
    beta: t('Market sensitivity; 1.0 means moving in sync with the market'),
    smb: t('Size factor loading; positive tilts toward small-cap stocks'),
    hml: t('Value factor loading; positive tilts toward value stocks'),
    r2: t('Model explanatory power; closer to 1 means factors explain returns more fully'),
  };
  const rows = [
    ['Alpha', C.alpha, fmtPct(r.alpha), r.alpha >= 0 ? 'text-success' : 'text-danger', d.alpha],
    ['Beta (MKT-RF)', C.beta, fmtNum(r.beta, 3), 'text-fg', d.beta],
    ...(f.includes('smb') ? [['SMB', C.smb, fmtNum(r.smb, 3), 'text-fg', d.smb] as const] : []),
    ...(f.includes('hml') ? [['HML', C.hml, fmtNum(r.hml, 3), 'text-fg', d.hml] as const] : []),
    ['R\u00B2', 'transparent', fmtNum(r.rSquared, 3), 'text-fg', d.r2],
  ].map(([label, color, value, cls, desc]) => ({ label, color, value, cls, desc })) as Array<{
    label: string;
    color: string;
    value: string;
    cls: string;
    desc: string;
  }>;
  const cols: SimpleTableColumn<(typeof rows)[number]>[] = [
    {
      key: 'label',
      label: t('Coefficient'),
      render: (x) => <PortfolioLabel color={x.color} name={x.label} />,
    },
    {
      key: 'value',
      label: t('Estimate'),
      align: 'right',
      render: (x) => (
        <span className={cn('font-mono tabular-nums font-medium', x.cls)}>{x.value}</span>
      ),
    },
    { key: 'desc', label: t('Meaning') },
  ];
  return (
    <Card className="overflow-hidden">
      <SimpleTable columns={cols} data={rows} rowKey={(x) => x.label} />
    </Card>
  );
}
function FactorRegressionResultsPanel({
  state: s,
}: {
  state: ReturnType<typeof useFactorRegressionState>;
}) {
  const { result: r, error, selectedFactors, isLoading } = s;
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={error}
      errorPrefix={`${t('Analysis failed')}: `}
      isLoading={isLoading}
      hasResults={!!r}
      loadingLabel={t('Loading...')}
      emptyTitle={t('Configure parameters and click "Run Analysis" to see results')}
    >
      {r && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ['Alpha', fmtPct(r.alpha), r.alpha >= 0 ? 'pos' : 'neg', FACTOR_COLORS.alpha],
                ['Beta (MKT-RF)', fmtNum(r.beta, 3), undefined, FACTOR_COLORS.beta],
                ['R\u00B2', fmtNum(r.rSquared, 3), undefined, 'transparent'],
              ] as const
            ).map(([label, value, tone, color]) => (
              <StatCard
                key={label}
                label={label}
                value={value}
                tone={tone as never}
                color={color}
              />
            ))}
          </div>
          <CollapsibleSection title={t('Fama-French Three-Factor Regression Results')} defaultOpen>
            <RegressionResultTable result={r} selectedFactors={selectedFactors} />
          </CollapsibleSection>
          {r.residuals.length > 0 && (
            <CollapsibleSection title={t('Regression Residuals')} defaultOpen>
              <Card className="p-4">
                <BarChartContent
                  data={r.residuals.map((v, i) => ({ index: i, value: v }))}
                  seriesNames={[t('Residuals')]}
                  xDataKey="index"
                  height={200}
                  yTickFormatter={(v) => v.toFixed(3)}
                  tooltipValueFormatter={(v) => [v.toFixed(4), t('Residuals')]}
                  signColorSingleSeries
                  showLegend={false}
                  xTickFontSize={9}
                />
              </Card>
            </CollapsibleSection>
          )}
          <div className="rounded-md border border-border-subtle bg-input-bg p-3 text-caption italic text-fg-tertiary">
            {t(
              'Factor data sourced from Kenneth French database (simulated data). The full version will integrate real-time Fama-French factor data.',
            )}
          </div>
        </div>
      )}
    </ResultsShell>
  );
}
const config: ComputeToolConfig<ReturnType<typeof useFactorRegressionState>> = {
  titleKey: 'factorRegression.title',
  seoDescKey: 'factorRegression.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'factorRegression.seo.desc' },
    { titleKey: 'factorRegression.seo.factorTitle', descKey: 'factorRegression.seo.factorDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.rebalancingSensitivity', href: '/rebalancing-sensitivity' },
  ],
  params: FactorRegressionParamsPanel,
  results: FactorRegressionResultsPanel,
};
export default function FactorRegressionPage() {
  const { t } = useTranslation();
  const s = useFactorRegressionState(t);
  return <ComputeToolShell config={config} state={s} />;
}
