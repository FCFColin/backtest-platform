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
interface FetchRegressionParams {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
}
const FACTOR_OPTIONS = [
  {
    key: 'mktRF',
    label: 'factorRegression.factors.mktRf',
    desc: 'factorRegression.factors.mktRfDesc',
  },
  {
    key: 'smb',
    label: 'factorRegression.factors.smb',
    desc: 'factorRegression.factors.smbDesc',
  },
  {
    key: 'hml',
    label: 'factorRegression.factors.hml',
    desc: 'factorRegression.factors.hmlDesc',
  },
];
const FACTOR_COLORS = {
  alpha: getPortfolioColor(0),
  beta: getPortfolioColor(1),
  smb: getPortfolioColor(2),
  hml: getPortfolioColor(3),
} as const;
let ffDataCache: FFDataPoint[] | null = null;
async function loadFamaFrenchData(): Promise<FFDataPoint[]> {
  if (ffDataCache) return ffDataCache;
  const rows = await apiGetJSON<Array<Record<string, unknown>>>(
    '/api/v1/data/factors',
    i18n.t('Failed to load Fama-French factor data'),
  );
  ffDataCache = rows.map((r) => ({
    date: String(r.date ?? ''),
    mktRf: Number(r.mktRf ?? r.mkt_rf) || 0,
    smb: Number(r.smb) || 0,
    hml: Number(r.hml) || 0,
    rf: Number(r.rf) || 0,
  }));
  return ffDataCache;
}
function extractTickerReturns(
  tickersData: Array<{
    ticker: string;
    growthCurve?: Array<{ date: string }>;
    dailyReturns?: number[];
  }>,
): Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> {
  const result: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }> = [];
  for (const tk of tickersData) {
    const gc = tk.growthCurve ?? [];
    const dr = tk.dailyReturns ?? [];
    if (gc.length < 2 || dr.length < 1) continue;
    const dates = gc.slice(1).map((p: { date: string }) => p.date);
    result.push({ ticker: tk.ticker, dailyReturns: dr, dates });
  }
  return result;
}
function computeCombinedMonthlyReturns(
  tickerReturns: Array<{ ticker: string; dailyReturns: number[]; dates: string[] }>,
  weightMap: Map<string, number>,
): Array<{ date: string; value: number }> {
  const longest = tickerReturns.reduce((a, b) =>
    a.dailyReturns.length > b.dailyReturns.length ? a : b,
  );
  const combinedMonthlyReturns = new Map<string, number>();
  for (let i = 0; i < longest.dailyReturns.length; i++) {
    const date = longest.dates[i];
    if (!date) continue;
    const monthKey = date.slice(0, 7);
    let dailyReturn = 0;
    for (const tr of tickerReturns) {
      const idx = tr.dates.indexOf(date);
      if (idx >= 0) dailyReturn += tr.dailyReturns[idx] * (weightMap.get(tr.ticker) ?? 0);
    }
    const prev = combinedMonthlyReturns.get(monthKey) ?? 1;
    combinedMonthlyReturns.set(monthKey, prev * (1 + dailyReturn));
  }
  return Array.from(combinedMonthlyReturns.entries())
    .map(([date, value]) => ({ date, value: value - 1 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
async function fetchRegression(params: FetchRegressionParams): Promise<FactorRegressionResult> {
  const { validAssets, startDate, endDate, selectedFactors } = params;
  const errFetchData = i18n.t('Failed to fetch market data');
  const errRegCompute = i18n.t('Factor regression computation failed');
  const tickers = validAssets.map((a) => a.ticker);
  const analysisData = await apiPostJSON<{
    tickers?: Parameters<typeof extractTickerReturns>[0];
  }>(
    '/api/v1/backtest/analysis',
    {
      tickers,
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
    errFetchData,
  );
  const tickerReturns = extractTickerReturns(analysisData.tickers ?? []);
  if (tickerReturns.length === 0) throw new Error(i18n.t('Insufficient price data available'));
  const totalW = validAssets.reduce((s, a) => s + (a.weight || 0), 0);
  const weightMap = new Map(validAssets.map((a) => [a.ticker, (a.weight || 0) / totalW]));
  const monthlyReturns = computeCombinedMonthlyReturns(tickerReturns, weightMap);
  if (monthlyReturns.length < 3)
    throw new Error(i18n.t('Insufficient data points (at least 3 months required)'));
  const ffData = await loadFamaFrenchData();
  return apiPostJSON<FactorRegressionResult>(
    '/api/v1/analysis/factor-regression',
    {
      monthlyReturns,
      ffData,
      factors: selectedFactors,
      startDate,
      endDate,
    },
    errRegCompute,
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
  const toggleFactor = (key: string) =>
    s.setSelectedFactors(
      s.selectedFactors.includes(key)
        ? s.selectedFactors.filter((f) => f !== key)
        : [...s.selectedFactors, key],
    );
  const runRegression = () => {
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
    if (s.selectedFactors.length === 0) {
      setError(t('Please select at least one factor'));
      return;
    }
    s.setResult(null);
    run(async () => {
      try {
        const r = await fetchRegression({
          validAssets,
          startDate: s.startDate,
          endDate: s.endDate,
          selectedFactors: s.selectedFactors,
        });
        s.setResult(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('Regression computation failed');
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
            {FACTOR_OPTIONS.map((opt) => {
              const active = s.selectedFactors.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => s.toggleFactor(opt.key)}
                  aria-pressed={active}
                  className={badgeVariants({
                    variant: active ? 'asset' : 'secondary',
                    size: 'sm',
                    className: 'cursor-pointer',
                  })}
                >
                  {t(opt.label)}
                  <span className="font-normal opacity-70">({t(opt.desc)})</span>
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
  result,
  selectedFactors,
}: {
  result: FactorRegressionResult;
  selectedFactors: string[];
}) {
  const { t } = useTranslation();
  const rows: { label: string; color: string; value: string; cls: string; desc: string }[] = [
    {
      label: 'Alpha',
      color: FACTOR_COLORS.alpha,
      value: fmtPct(result.alpha),
      cls: result.alpha >= 0 ? 'text-success' : 'text-danger',
      desc: t(
        "Portfolio excess return (annualized); positive means outperforming the factor model's expectation",
      ),
    },
    {
      label: 'Beta (MKT-RF)',
      color: FACTOR_COLORS.beta,
      value: fmtNum(result.beta, 3),
      cls: 'text-fg',
      desc: t('Market sensitivity; 1.0 means moving in sync with the market'),
    },
    ...(selectedFactors.includes('smb')
      ? [
          {
            label: 'SMB',
            color: FACTOR_COLORS.smb,
            value: fmtNum(result.smb, 3),
            cls: 'text-fg',
            desc: t('Size factor loading; positive tilts toward small-cap stocks'),
          },
        ]
      : []),
    ...(selectedFactors.includes('hml')
      ? [
          {
            label: 'HML',
            color: FACTOR_COLORS.hml,
            value: fmtNum(result.hml, 3),
            cls: 'text-fg',
            desc: t('Value factor loading; positive tilts toward value stocks'),
          },
        ]
      : []),
    {
      label: 'R²',
      color: 'transparent',
      value: fmtNum(result.rSquared, 3),
      cls: 'text-fg',
      desc: t('Model explanatory power; closer to 1 means factors explain returns more fully'),
    },
  ];
  const columns: SimpleTableColumn<(typeof rows)[number]>[] = [
    {
      key: 'label',
      label: t('Coefficient'),
      render: (r) => <PortfolioLabel color={r.color} name={r.label} />,
    },
    {
      key: 'value',
      label: t('Estimate'),
      align: 'right',
      render: (r) => (
        <span className={cn('font-mono tabular-nums font-medium', r.cls)}>{r.value}</span>
      ),
    },
    { key: 'desc', label: t('Meaning') },
  ];
  return (
    <Card className="overflow-hidden">
      <SimpleTable columns={columns} data={rows} rowKey={(r) => r.label} />
    </Card>
  );
}
function FactorRegressionResultsPanel({
  state: s,
}: {
  state: ReturnType<typeof useFactorRegressionState>;
}) {
  const { result, error, selectedFactors, isLoading } = s;
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={error}
      errorPrefix={`${t('Analysis failed')}: `}
      isLoading={isLoading}
      hasResults={!!result}
      loadingLabel={t('Loading...')}
      emptyTitle={t('Configure parameters and click "Run Analysis" to see results')}
    >
      {result && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Alpha"
              value={fmtPct(result.alpha)}
              tone={result.alpha >= 0 ? 'pos' : 'neg'}
              color={FACTOR_COLORS.alpha}
            />
            <StatCard
              label="Beta (MKT-RF)"
              value={fmtNum(result.beta, 3)}
              color={FACTOR_COLORS.beta}
            />
            <StatCard label="R²" value={fmtNum(result.rSquared, 3)} color="transparent" />
          </div>
          <CollapsibleSection title={t('Fama-French Three-Factor Regression Results')} defaultOpen>
            <RegressionResultTable result={result} selectedFactors={selectedFactors} />
          </CollapsibleSection>
          {result.residuals.length > 0 && (
            <CollapsibleSection title={t('Regression Residuals')} defaultOpen>
              <Card className="p-4">
                <BarChartContent
                  data={result.residuals.map((r, i) => ({ index: i, value: r }))}
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
