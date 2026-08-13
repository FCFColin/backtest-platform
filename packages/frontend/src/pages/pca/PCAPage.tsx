import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { type PCAResult } from '@backtest/shared';
import { Card, buttonVariants, LoadingButton, AffixInput } from '@/components/ui/uiComponents';
import { CollapsibleSection } from '@/components/cards.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { useComputeTool, useListState } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { getCorrelationColor, getPortfolioColor } from '@/lib/chart-theme.js';
import EChart from '@/components/charts/EChart.js';
import {
  AXIS_TEXT,
  BORDER_SOFT,
  axisTooltipFormatter,
  getCorrelationTextColor,
  tooltipOption,
} from '@/components/charts/chartUtils.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import { Field, FieldLabel, FieldDescription } from '../../components/form/Field.js';
import { DateField } from '../../components/form/sharedFields.js';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { useTagDiff } from '@/components/params/toolFields.js';
import { XYScatterChart } from '@/components/charts/sharedChartContent.js';
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
        t('PCA analysis failed'),
      );
    },
    () =>
      tickers.map((tk) => tk.trim()).filter(Boolean).length >= 2
        ? null
        : t('PCA analysis requires at least 2 ticker symbols'),
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
function PCAParamsPanel({ state: s }: { state: PCAState }) {
  const { t } = useTranslation();
  const handleTagChange = useTagDiff(s.tickers, s.addTicker, s.removeTicker, s.updateTicker);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('Asset Selection')}</FieldLabel>
          <TickerTagInput
            tickers={s.tickers}
            onChange={handleTagChange}
            minCount={2}
            placeholder={t('Enter symbol, e.g. SPY')}
          />
          <FieldDescription>
            {t('Add 2 or more ticker symbols; PCA analyzes their daily returns')}
          </FieldDescription>
        </Field>
      </div>
      <DateField
        id="pca-start-date"
        label={t('Start Date')}
        value={s.startDate}
        onChange={s.setStartDate}
      />
      <DateField
        id="pca-end-date"
        label={t('End Date')}
        value={s.endDate}
        onChange={s.setEndDate}
      />
      <Field>
        <FieldLabel htmlFor="pca-num-components">{t('Number of Components')}</FieldLabel>
        <AffixInput
          id="pca-num-components"
          type="number"
          min={1}
          value={s.numComponents}
          onChange={(e) => s.setNumComponents(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={t('Auto')}
          suffix={t('pca.params.numComponentsSuffix')}
        />
        <FieldDescription>
          {t('Leave empty to keep all components (equals the number of assets)')}
        </FieldDescription>
      </Field>
      <div className="col-span-full">
        <LoadingButton
          isLoading={s.isLoading}
          onClick={s.runAnalysis}
          loadingText={t('Analyzing...')}
          className={buttonVariants({ variant: 'primary', size: 'lg', className: 'w-full' })}
        >
          <Play className="w-4 h-4" />
          {t('Run Analysis')}
        </LoadingButton>
      </div>
    </div>
  );
}
function EigenvalueBarChart({ data }: { data: { component: string; eigenvalue: number }[] }) {
  const { t } = useTranslation();
  const option: EChartsOption = {
    grid: { top: 20, right: 40, bottom: 20, left: 80 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.component),
      axisLabel: AXIS_TEXT,
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...AXIS_TEXT, formatter: (v: number) => v.toFixed(2) },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(
      axisTooltipFormatter(undefined, (v) => [v.toFixed(4), t('Eigenvalues')]),
    ),
    series: [
      {
        type: 'bar',
        name: t('Eigenvalues'),
        data: data.map((d) => ({
          value: d.eigenvalue,
          itemStyle: { color: getPortfolioColor(0), borderRadius: [2, 2, 0, 0] },
        })),
        barMaxWidth: 60,
      },
    ],
  };
  return (
    <Card className="p-4">
      <EChart option={option} height={300} ariaLabel={t('Eigenvalues')} />
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
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, t('Cumulative Variance')]}
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
        getBackgroundColor={getCorrelationColor}
        getTextColor={getCorrelationTextColor}
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
      <XYScatterChart
        xKey="pc1"
        yKey="pc2"
        xName="PC1"
        yName="PC2"
        height={450}
        zRange={[20, 20]}
        tooltipFormatter={(v: number, n: string) => [v.toFixed(4), n]}
        series={[{ data, color: getPortfolioColor(2), opacity: 0.5 }]}
        referenceLines={[
          { axis: 'y', value: 0, color: 'hsl(var(--fg-tertiary))', dash: '4 4' },
          { axis: 'x', value: 0, color: 'hsl(var(--fg-tertiary))', dash: '4 4' },
        ]}
      />
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
      errorPrefix={t('Analysis failed: ')}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      {results && (
        <div className="flex flex-col gap-3">
          <CollapsibleSection title={t('Eigenvalues')} defaultOpen>
            <EigenvalueBarChart data={eigenvalueData} />
          </CollapsibleSection>
          <CollapsibleSection title={t('Cumulative Variance Explained')} defaultOpen>
            <CumulativeVarianceChart data={cumulativeData} />
          </CollapsibleSection>
          <CollapsibleSection title={t('Loading Matrix')} defaultOpen>
            <LoadingMatrix results={results} />
          </CollapsibleSection>
          {results.scores.length > 0 && results.scores[0].length >= 2 && (
            <CollapsibleSection title={t('Principal Component Scores (PC1 vs PC2)')} defaultOpen>
              <PCAScatterChart data={scatterData} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </ResultsShell>
  );
}
const config: ComputeToolConfig<PCAState> = {
  titleKey: 'nav.pca',
  seoDescKey: 'pca.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'pca.seo.analyzableDesc' },
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
