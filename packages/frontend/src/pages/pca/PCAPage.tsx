import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { CHART_COLORS, type PCAResult } from '@backtest/shared';
import { Card, buttonVariants, Input, LoadingButton } from '@/components/ui/uiComponents';
import { CollapsibleSection } from '@/components/cards.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { useComputeTool, useListState } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import {
  AXIS_TICK_STYLE,
  CHART_GRID_PROPS,
  CHART_MARGIN,
  CHART_TOOLTIP_STYLE,
  pickByThreshold,
  type ThresholdBand,
} from '@/lib/chart-theme.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import { Field, FieldLabel, FieldDescription } from '../../components/form/Field.js';
import { LabeledField } from '../../components/form/sharedFields.js';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';

/** Shared tag-change handler for TickerTagInput ↔ useListState bridge */
function tagChangeHandler(
  tickers: string[],
  onAdd: () => void,
  onRemove: (i: number) => void,
  onUpdate: (i: number, v: string) => void,
) {
  return (newTickers: string[]) => {
    const oldLen = tickers.length;
    if (newTickers.length > oldLen) onAdd();
    else if (newTickers.length < oldLen) {
      for (let i = 0; i < oldLen; i++) {
        if (!newTickers.includes(tickers[i])) {
          onRemove(i);
          break;
        }
      }
    } else {
      newTickers.forEach((tk, i) => {
        if (tk !== tickers[i]) onUpdate(i, tk);
      });
    }
  };
}
function usePcaPageState() {
  const { t } = useTranslation();
  const {
    items: tickers,
    addItem: addTicker,
    removeItem: removeTicker,
    updateItem,
  } = useListState<string>(['SPY', 'TLT', 'GLD', 'QQQ'], () => '', 1);
  const updateTicker = (idx: number, val: string) => updateItem(idx, () => val);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [numComponents, setNumComponents] = useState<number | ''>('');
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<PCAResult>(
    async () => {
      const validTickers = tickers.map((tk) => tk.trim()).filter(Boolean);
      return apiPostJSON<PCAResult>(
        '/api/v1/pca/analyze',
        {
          tickers: validTickers,
          startDate,
          endDate,
          numComponents: numComponents === '' ? undefined : numComponents,
        },
        i18n.t('pca.errAnalyze'),
      );
    },
    () =>
      tickers.map((tk) => tk.trim()).filter(Boolean).length >= 2 ? null : t('pca.errMinTwoTickers'),
  );
  return {
    tickers,
    startDate,
    endDate,
    numComponents,
    isLoading,
    error,
    results,
    addTicker,
    removeTicker,
    updateTicker,
    setStartDate,
    setEndDate,
    setNumComponents,
    runAnalysis,
  };
}
type PCAState = ReturnType<typeof usePcaPageState>;
const LOADING_COLOR_BANDS: ReadonlyArray<ThresholdBand> = [
  { threshold: 0.8, value: '#1a7a3a' },
  { threshold: 0.6, value: '#2e8b57' },
  { threshold: 0.4, value: '#6abf7e' },
  { threshold: 0.2, value: '#b8e0c4' },
  { threshold: -0.2, value: 'var(--surface)' },
  { threshold: -0.4, value: '#f0c8c8' },
  { threshold: -0.6, value: '#d47070' },
  { threshold: -0.8, value: '#b04040' },
];
const DEFAULT_LOADING_COLOR = '#8b2020';
function getLoadingColor(loading: number): string {
  return pickByThreshold(loading, LOADING_COLOR_BANDS, DEFAULT_LOADING_COLOR);
}
function PCAParamsPanel({ state: s }: { state: PCAState }) {
  const { t } = useTranslation();
  const handleTagChange = tagChangeHandler(s.tickers, s.addTicker, s.removeTicker, s.updateTicker);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('pca.asset.section')}</FieldLabel>
          <TickerTagInput
            tickers={s.tickers}
            onChange={handleTagChange}
            minCount={2}
            placeholder={t('pca.asset.tickerPlaceholder')}
          />
          <FieldDescription>{t('pca.asset.sectionInfo')}</FieldDescription>
        </Field>
      </div>
      <LabeledField htmlFor="pca-start-date" label={t('pca.dateRange.startDate')}>
        <Input
          id="pca-start-date"
          type="date"
          value={s.startDate}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </LabeledField>
      <LabeledField htmlFor="pca-end-date" label={t('pca.dateRange.endDate')}>
        <Input
          id="pca-end-date"
          type="date"
          value={s.endDate}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </LabeledField>
      <Field>
        <FieldLabel htmlFor="pca-num-components">{t('pca.params.numComponents')}</FieldLabel>
        <div className="relative">
          <Input
            id="pca-num-components"
            type="number"
            min={1}
            className="pr-12"
            value={s.numComponents}
            onChange={(e) =>
              s.setNumComponents(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder={t('pca.params.numComponentsPlaceholder')}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">
            {t('pca.params.numComponentsSuffix')}
          </span>
        </div>
        <FieldDescription>{t('pca.params.numComponentsHint')}</FieldDescription>
      </Field>
      <div className="col-span-full">
        <LoadingButton
          isLoading={s.isLoading}
          onClick={s.runAnalysis}
          loadingText={t('pca.analyzing')}
          className={buttonVariants({ variant: 'primary', size: 'lg', className: 'w-full' })}
        >
          <Play className="w-4 h-4" />
          {t('pca.startAnalysis')}
        </LoadingButton>
      </div>
    </div>
  );
}
function EigenvalueBarChart({ data }: { data: { component: string; eigenvalue: number }[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="component" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [value.toFixed(4), t('pca.results.eigenvalue')]}
          />
          <Bar dataKey="eigenvalue" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
function CumulativeVarianceChart({ data }: { data: { component: string; cumulative: number }[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <TimeSeriesLineChart
        data={data}
        xDataKey="component"
        height={300}
        yDomain={[0, 100]}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [
          `${v.toFixed(2)}%`,
          t('pca.results.cumulativeVarianceLabel'),
        ]}
        referenceY={90}
        showLegend={false}
        colorOffset={1}
        series={[{ dataKey: 'cumulative', showDots: true, dotR: 4, activeDotR: 6 }]}
      />
    </Card>
  );
}
function LoadingMatrix({ results }: { results: PCAResult }) {
  return (
    <Card className="p-4">
      <MatrixHeatmap
        rowLabels={results.tickers}
        columnLabels={results.eigenvalues.map((_, j) => `PC${j + 1}`)}
        matrix={results.loadings}
        getBackgroundColor={getLoadingColor}
        getTextColor={(loading) => (Math.abs(loading) > 0.6 ? '#fff' : '#000')}
        formatValue={(v) => v.toFixed(2)}
        formatTitle={(v, rowLabel, colLabel) => `${rowLabel} · ${colLabel}: ${v.toFixed(3)}`}
        minCellWidth={56}
      />
    </Card>
  );
}
function PCAScatterChart({ data }: { data: { pc1: number; pc2: number }[] }) {
  return (
    <Card className="p-4">
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            type="number"
            dataKey="pc1"
            name="PC1"
            tick={AXIS_TICK_STYLE}
            label={{
              value: 'PC1',
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--fg-tertiary)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="pc2"
            name="PC2"
            tick={AXIS_TICK_STYLE}
            label={{
              value: 'PC2',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--fg-tertiary)', fontSize: 12 },
            }}
          />
          <ZAxis range={[20, 20]} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [value.toFixed(4), name]}
            labelFormatter={() => ''}
          />
          <Scatter data={data} fill={CHART_COLORS[2]} fillOpacity={0.5} />
          <ReferenceLine y={0} stroke="var(--fg-tertiary)" strokeDasharray="4 4" />
          <ReferenceLine x={0} stroke="var(--fg-tertiary)" strokeDasharray="4 4" />
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
function PCAResultsPanel({ state: s }: { state: PCAState }) {
  const { results, error, isLoading } = s;
  const { t } = useTranslation();
  const eigenvalueData = useMemo(() => {
    if (!results) return [];
    return results.eigenvalues.map((val, idx) => ({
      component: `PC${idx + 1}`,
      eigenvalue: +val.toFixed(4),
    }));
  }, [results]);
  const cumulativeData = useMemo(() => {
    if (!results) return [];
    return results.cumulativeVariance.map((val, idx) => ({
      component: `PC${idx + 1}`,
      cumulative: +(val * 100).toFixed(2),
    }));
  }, [results]);
  const scatterData = useMemo(() => {
    if (!results || results.scores.length === 0) return [];
    const raw = results.scores;
    const step = Math.max(1, Math.ceil(raw.length / 400));
    return raw
      .filter((_, i) => i % step === 0)
      .map((row) => ({
        pc1: +row[0].toFixed(4),
        pc2: row[1] !== undefined ? +row[1].toFixed(4) : 0,
      }));
  }, [results]);
  return (
    <ResultsShell
      error={error}
      isLoading={isLoading}
      hasResults={!!results}
      errorPrefix={t('pca.analysisFailedPrefix')}
      loadingLabel={t('pca.analyzing')}
      emptyTitle={t('pca.emptyHint')}
    >
      {results && (
        <div className="flex flex-col gap-3">
          <CollapsibleSection title={t('pca.results.eigenvalue')} defaultOpen>
            <EigenvalueBarChart data={eigenvalueData} />
          </CollapsibleSection>
          <CollapsibleSection title={t('pca.results.cumulativeVariance')} defaultOpen>
            <CumulativeVarianceChart data={cumulativeData} />
          </CollapsibleSection>
          <CollapsibleSection title={t('pca.results.loadingMatrix')} defaultOpen>
            <LoadingMatrix results={results} />
          </CollapsibleSection>
          {results.scores.length > 0 && results.scores[0].length >= 2 && (
            <CollapsibleSection title={t('pca.results.scatterTitle')} defaultOpen>
              <PCAScatterChart data={scatterData} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </ResultsShell>
  );
}
const config: ComputeToolConfig<PCAState> = {
  titleKey: 'pca.title',
  seoDescKey: 'pca.seo.desc',
  seoFeatures: [
    { titleKey: 'pca.seo.analyzableTitle', descKey: 'pca.seo.analyzableDesc' },
    { titleKey: 'pca.seo.scenarioTitle', descKey: 'pca.seo.scenarioDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
  ],
  params: PCAParamsPanel,
  results: PCAResultsPanel,
};
export default function PCAPage() {
  const s = usePcaPageState();
  return <ComputeToolShell config={config} state={s} />;
}
