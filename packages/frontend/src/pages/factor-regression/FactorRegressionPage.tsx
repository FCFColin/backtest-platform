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
import * as C from '@/utils/constants';
import { validateAssetWeights } from '@/utils/validation';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { apiPostJSON, apiGetJSON } from '../../utils/apiClient.js';
import i18n from '../../i18n/index.js';
type FFDataPoint = { date: string; mktRf: number; smb: number; hml: number; rf: number };
type FactorRegressionResult = Record<'alpha' | 'beta' | 'smb' | 'hml' | 'rSquared', number> & {
  residuals: number[];
};
type AssetItem = { ticker: string; weight: number };
type RegressionState = ReturnType<typeof useFactorRegressionState>;
const FACTOR_OPTIONS = [
  ['mktRF', 'factorRegression.factors.mktRf', 'factorRegression.factors.mktRfDesc'],
  ['smb', 'factorRegression.factors.smb', 'factorRegression.factors.smbDesc'],
  ['hml', 'factorRegression.factors.hml', 'factorRegression.factors.hmlDesc'],
] as const;
const pc = getPortfolioColor;
const FACTOR_COLORS = { alpha: pc(0), beta: pc(1), smb: pc(2), hml: pc(3) } as const;
const newAsset = (): AssetItem => ({ ticker: '', weight: 0 });
let ffCache: FFDataPoint[] | null = null;
async function loadFF(): Promise<FFDataPoint[]> {
  if (ffCache) return ffCache;
  const rows = await apiGetJSON<Array<Record<string, unknown>>>(
    '/api/v1/data/factors',
    i18n.t('Failed to load Fama-French factor data'),
  );
  ffCache = rows.map((r) => ({
    date: String(r.date ?? ''),
    mktRf: Number(r.mktRf ?? r.mkt_rf) || 0,
    smb: Number(r.smb) || 0,
    hml: Number(r.hml) || 0,
    rf: Number(r.rf) || 0,
  }));
  return ffCache;
}
async function fetchRegression(
  assets: AssetItem[],
  startDate: string,
  endDate: string,
  factors: string[],
): Promise<FactorRegressionResult> {
  const data = await apiPostJSON<{
    tickers?: Array<{
      ticker: string;
      growthCurve?: Array<{ date: string }>;
      dailyReturns?: number[];
    }>;
  }>(
    '/api/v1/backtest/analysis',
    {
      tickers: assets.map((x) => x.ticker),
      parameters: {
        startDate,
        endDate,
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
  const tks = (data.tickers ?? [])
    .filter((tk) => (tk.growthCurve?.length ?? 0) >= 2 && (tk.dailyReturns?.length ?? 0) >= 1)
    .map((tk) => ({
      ticker: tk.ticker,
      dailyReturns: tk.dailyReturns ?? [],
      dates: (tk.growthCurve ?? []).slice(1).map((x) => x.date),
    }));
  if (tks.length === 0) throw new Error(i18n.t('Insufficient price data available'));
  const tot = assets.reduce((sum, x) => sum + (x.weight || 0), 0);
  const w = new Map(assets.map((x) => [x.ticker, (x.weight || 0) / tot]));
  const longest = tks.reduce((x, y) => (x.dailyReturns.length > y.dailyReturns.length ? x : y));
  const agg = new Map<string, number>();
  for (let i = 0; i < longest.dailyReturns.length; i++) {
    const d = longest.dates[i];
    if (!d) continue;
    const ret = tks.reduce((a, tr) => {
      const j = tr.dates.indexOf(d);
      return j >= 0 ? a + tr.dailyReturns[j] * (w.get(tr.ticker) ?? 0) : a;
    }, 0);
    const k = d.slice(0, 7);
    agg.set(k, (agg.get(k) ?? 1) * (1 + ret));
  }
  const monthlyReturns = Array.from(agg.entries())
    .map(([date, v]) => ({ date, value: v - 1 }))
    .sort((x, y) => x.date.localeCompare(y.date));
  if (monthlyReturns.length < 3)
    throw new Error(i18n.t('Insufficient data points (at least 3 months required)'));
  const ff = await loadFF();
  return apiPostJSON<FactorRegressionResult>(
    '/api/v1/analysis/factor-regression',
    { monthlyReturns, ffData: ff, factors, startDate, endDate },
    i18n.t('Factor regression computation failed'),
  );
}
function useFactorRegressionState(t: TFunction) {
  const s = useSetterState({
    startDate: C.DEFAULT_BACKTEST_START_DATE,
    endDate: C.DEFAULT_END_DATE,
    selectedFactors: ['mktRF', 'smb', 'hml'] as string[],
    result: null as FactorRegressionResult | null,
  });
  const list = useAssetList([...C.DEFAULT_60_40_ASSETS], newAsset, 0);
  const { assets } = list;
  const { isLoading, error, run, setError } = useAsyncAction();
  const toggleFactor = (k: string) => {
    const f = s.selectedFactors;
    s.setSelectedFactors(f.includes(k) ? f.filter((x) => x !== k) : [...f, k]);
  };
  const runRegression = () => {
    const valid = assets.filter((x) => x.ticker.trim() !== '');
    if (valid.length === 0) return setError(t('Please add at least one ticker'));
    const err = validateAssetWeights(assets);
    if (err) return setError(err);
    if (s.selectedFactors.length === 0) return setError(t('Please select at least one factor'));
    s.setResult(null);
    run(async () => {
      try {
        s.setResult(await fetchRegression(valid, s.startDate, s.endDate, s.selectedFactors));
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('Regression computation failed');
        setError(msg);
        useToastStore.getState().addToast('error', msg);
      }
    });
  };
  return { ...s, ...list, isLoading, error, runRegression, toggleFactor };
}

function FactorRegressionParamsPanel({ state: s }: { state: RegressionState }) {
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
      <Field className="col-span-full">
        <FieldLabel>{t('Factor Selection (Multi-select)')}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {FACTOR_OPTIONS.map(([k, l, d]) => (
            <button
              key={k}
              type="button"
              onClick={() => s.toggleFactor(k)}
              aria-pressed={s.selectedFactors.includes(k)}
              className={badgeVariants({
                variant: s.selectedFactors.includes(k) ? 'asset' : 'secondary',
                size: 'sm',
                className: 'cursor-pointer',
              })}
            >
              {t(l)}
              <span className="font-normal opacity-70">({t(d)})</span>
            </button>
          ))}
        </div>
      </Field>
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
function regressionTable(r: FactorRegressionResult, f: string[], t: TFunction) {
  const F = FACTOR_COLORS;
  const d = {
    alpha: t(
      "Portfolio excess return (annualized); positive means outperforming the factor model's expectation",
    ),
    beta: t('Market sensitivity; 1.0 means moving in sync with the market'),
    smb: t('Size factor loading; positive tilts toward small-cap stocks'),
    hml: t('Value factor loading; positive tilts toward value stocks'),
    r2: t('Model explanatory power; closer to 1 means factors explain returns more fully'),
  };
  const maybe = (on: boolean, x: [string, string, string, string, string]) => (on ? [x] : []);
  const specs: Array<[string, string, string, string, string]> = [
    ['Alpha', F.alpha, fmtPct(r.alpha), r.alpha >= 0 ? 'text-success' : 'text-danger', d.alpha],
    ['Beta (MKT-RF)', F.beta, fmtNum(r.beta, 3), 'text-fg', d.beta],
    ...maybe(f.includes('smb'), ['SMB', F.smb, fmtNum(r.smb, 3), 'text-fg', d.smb]),
    ...maybe(f.includes('hml'), ['HML', F.hml, fmtNum(r.hml, 3), 'text-fg', d.hml]),
    ['R\u00B2', 'transparent', fmtNum(r.rSquared, 3), 'text-fg', d.r2],
  ];
  const rows = specs.map(([l, c, v, s, x]) => ({ label: l, color: c, value: v, cls: s, desc: x }));
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
function FactorRegressionResultsPanel({ state: s }: { state: RegressionState }) {
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
            ).map(([l, v, tn, c]) => (
              <StatCard key={l} label={l} value={v} tone={tn as never} color={c} />
            ))}
          </div>
          <CollapsibleSection title={t('Fama-French Three-Factor Regression Results')} defaultOpen>
            {regressionTable(r, selectedFactors, t)}
          </CollapsibleSection>
          {r.residuals.length > 0 && (
            <CollapsibleSection title={t('Regression Residuals')} defaultOpen>
              <Card className="p-4">
                <BarChartContent
                  data={r.residuals.map((v, i) => ({ index: i, value: v }))}
                  seriesNames={[t('Residual')]}
                  xDataKey="index"
                  height={200}
                  yTickFormatter={(v) => v.toFixed(3)}
                  tooltipValueFormatter={(v) => [v.toFixed(4), t('Residual')]}
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
const config: ComputeToolConfig<RegressionState> = {
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
