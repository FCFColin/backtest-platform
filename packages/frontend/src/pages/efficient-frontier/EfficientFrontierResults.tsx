/* eslint-disable react-refresh/only-export-components */
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { type EfficientFrontierPoint } from '@backtest/shared';
import { getCorrelationColor, getPortfolioColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from '@/components/charts/chartUtils.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import {
  SimpleChart,
  XYScatterChart,
  type XYScatterSeriesSpec,
} from '@/components/charts/sharedChartContent.js';
import { Checkbox, Input, AffixInput, Button } from '@/components/ui/uiComponents';
import { Field as FieldShell, FieldLabel } from '@/components/form/Field';
import { SectionHeader, SelectField, RunButton, DateField } from '@/components/form/sharedFields';
import { AssetSelectionField, AllHistoryCheckbox } from '@/components/params/toolFields.js';
import { ErrorBanner } from '@/components/stateDisplay';
import { ResultsShell } from '@/components/resultsShell';
import { MiniStatCard } from '../../components/cards.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { fmtPct } from '@/utils/format';
import {
  sharpeToColor,
  useEfficientFrontierState,
  type FrontierState,
} from './EfficientFrontierUtils.js';
import type { SolveSpeed, FrontierSolver, ReturnObjective } from './EfficientFrontierUtils.js';
import { createComputeToolPage } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
const solveSpeedOptions = (t: TFunction): { value: SolveSpeed; label: string }[] => [
  { value: 'ultrafast', label: t('Ultra Fast') },
  { value: 'fast', label: t('Fast') },
  { value: 'medium', label: t('Medium') },
  { value: 'slow', label: t('Slow') },
];
const rebalanceFreqOptions = (t: TFunction): { value: string; label: string }[] => [
  { value: 'daily', label: t('Daily') },
  { value: 'weekly', label: t('Weekly') },
  { value: 'monthly', label: t('Monthly') },
  { value: 'quarterly', label: t('Quarterly') },
  { value: 'yearly', label: t('Annual') },
];
const returnObjOptions = (t: TFunction): { value: ReturnObjective; label: string }[] => [
  { value: 'maxCagr', label: t('backtest.optimizer.maxCagr') },
  { value: 'minVolatility', label: t('Minimize Volatility') },
];
const solverOptions = (t: TFunction): { value: FrontierSolver; label: string }[] => [
  { value: 'markowitz', label: t('Markowitz') },
  { value: 'nsga2', label: t('NSGA-II') },
];
function DateAndPointsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DateField label={t('Start Date')} value={s.startDate} onChange={s.setStartDate} />
      <DateField label={t('End Date')} value={s.endDate} onChange={s.setEndDate} />
      <FieldShell>
        <FieldLabel>{t('Sample Points')}</FieldLabel>
        <Input
          type="number"
          min={5}
          max={100}
          value={s.numPoints}
          onChange={(e) => s.setNumPoints(Number(e.target.value))}
        />
      </FieldShell>
      <FieldShell>
        <AllHistoryCheckbox
          startDate={s.startDate}
          endDate={s.endDate}
          onStartDateChange={s.setStartDate}
          onEndDateChange={s.setEndDate}
          label={t('All History')}
        />
      </FieldShell>
    </div>
  );
}
function AdvancedParamsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SelectField
        label={t('Solve Speed')}
        value={s.solveSpeed}
        onChange={s.setSolveSpeed}
        options={solveSpeedOptions(t)}
      />
      <FieldShell>
        <FieldLabel>{t('Min Inclusion Weight')}</FieldLabel>
        <AffixInput
          type="number"
          min={0}
          max={100}
          suffix="%"
          value={s.minInclusionWeight}
          onChange={(e) => s.setMinInclusionWeight(Number(e.target.value))}
        />
      </FieldShell>
      <SelectField
        label={t('Rebalancing Frequency')}
        value={s.rebalanceFrequency}
        onChange={s.setRebalanceFrequency}
        options={rebalanceFreqOptions(t)}
      />
      <SelectField
        label={t('Return Objective')}
        value={s.returnObjective}
        onChange={s.setReturnObjective}
        options={returnObjOptions(t)}
      />
      <SelectField
        label={t('Solver')}
        value={s.solver}
        onChange={s.setSolver}
        options={solverOptions(t)}
      />
      <FieldShell>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox checked={s.allowCash} onCheckedChange={(c) => s.setAllowCash(c === true)} />
          <span>{t('Allow Cash Allocation')}</span>
        </label>
      </FieldShell>
    </div>
  );
}
function ParamsSection({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={t('Parameters')} />
      <DateAndPointsGrid s={s} />
      <AdvancedParamsGrid s={s} />
    </section>
  );
}
function FrontierParams({ state }: { state: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <AssetSelectionField
        tickers={state.tickers.filter(Boolean)}
        onChange={state.setTickers}
        minCount={2}
        title={t('Ticker List')}
      />
      <ParamsSection s={state} />
      <RunButton
        isLoading={state.isLoading}
        onClick={state.runFrontier}
        label={t('Calculate Efficient Frontier')}
        loadingLabel={t('Calculating...')}
      />
    </div>
  );
}
function LoadInBacktesterButton({
  onClick,
  label,
  size = 'md',
}: {
  onClick: () => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Button onClick={onClick} variant="ghost" size={size === 'sm' ? 'sm' : 'default'}>
      <ArrowRight className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {label}
    </Button>
  );
}
function FrontierScatterChartInner({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
  height,
}: {
  scatterData: Array<{ expectedVolatility: number; expectedReturn: number; sharpeRatio: number }>;
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  height: number;
}) {
  const { t } = useTranslation();
  const scatterSeries: XYScatterSeriesSpec[] = scatterData.map((entry) => ({
    data: [entry],
    color: sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max),
    symbolSize: 6,
  }));
  if (maxSharpe) {
    scatterSeries.push({
      data: [
        {
          expectedVolatility: Number((maxSharpe.expectedVolatility * 100).toFixed(2)),
          expectedReturn: Number((maxSharpe.expectedReturn * 100).toFixed(2)),
          sharpeRatio: maxSharpe.sharpeRatio,
        },
      ],
      color: getPortfolioColor(0),
      symbol: 'star',
      symbolSize: 12,
    });
  }
  return (
    <XYScatterChart
      xKey="expectedVolatility"
      yKey="expectedReturn"
      xName={t('Volatility (%)')}
      yName={t('Return (%)')}
      zRange={[60, 60]}
      height={height}
      tooltipFormatter={(v: number) => `${v.toFixed(2)}%`}
      series={scatterSeries}
      onClick={({ seriesIndex }) => {
        const p = seriesIndex !== undefined ? (frontier[seriesIndex] ?? maxSharpe) : undefined;
        if (p) onSelectPoint(p);
      }}
    />
  );
}
function FrontierScatterChart({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
  onLoadInBacktester,
}: {
  scatterData: Array<{ expectedVolatility: number; expectedReturn: number; sharpeRatio: number }>;
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-fg">{t('nav.efficientFrontier')}</h3>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label={t('Load in backtester')} />
      </div>
      <FrontierScatterChartInner
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={frontier}
        onSelectPoint={onSelectPoint}
        height={400}
      />
    </div>
  );
}
function FrontierAllocations({
  allocationData,
  allAssetTickers,
}: {
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
}) {
  const { t } = useTranslation();
  if (allocationData.length === 0 || allAssetTickers.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Frontier Allocations')}</h3>
      <SimpleChart
        type="area"
        data={allocationData}
        xDataKey="point"
        height={300}
        xLabel={t('Frontier Point')}
        yTickFormatter={(v: number) => `${v}%`}
        yDomain={[0, 100]}
        tooltipFormatter={(v: number) => `${v}%`}
        showLegend={false}
        series={allAssetTickers.map((ticker, i) => ({
          dataKey: ticker,
          color: getPortfolioColor(i),
          stackId: '1',
          areaOpacity: 0.8,
        }))}
      />
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        {allAssetTickers.map((ticker, i) => (
          <div key={ticker} className="flex items-center gap-1 text-caption">
            <span
              className="inline-block size-3 rounded"
              style={{ backgroundColor: getPortfolioColor(i) }}
            />
            <span className="text-fg-tertiary">{ticker}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function CorrelationMatrixView({
  correlations,
}: {
  correlations: { tickers: string[]; matrix: number[][] } | null;
}) {
  const { t } = useTranslation();
  if (!correlations || correlations.tickers.length < 2) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Correlation Matrix')}</h3>
      <MatrixHeatmap
        rowLabels={correlations.tickers}
        columnLabels={correlations.tickers}
        matrix={correlations.matrix}
        getBackgroundColor={getCorrelationColor}
        getTextColor={getCorrelationTextColor}
        formatValue={(v) => v.toFixed(2)}
      />
    </div>
  );
}
const COLORS = {
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  brand: 'hsl(var(--brand))',
  fgSec: 'hsl(var(--fg-secondary))',
  fgTer: 'hsl(var(--fg-tertiary))',
} as const;
function WeightBar({ ticker, weight, color }: { ticker: string; weight: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[60px] shrink-0 text-label font-medium text-fg">{ticker}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
        <div
          className="h-full rounded-sm"
          style={{ width: `${weight * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-caption tabular-nums text-fg-tertiary">
        {fmtPct(weight, 1)}
      </span>
    </div>
  );
}
function WeightAllocation({ weights, title }: { weights: Record<string, number>; title: string }) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([ticker, weight], i) => (
          <WeightBar key={ticker} ticker={ticker} weight={weight} color={getPortfolioColor(i)} />
        ))}
      </div>
    </div>
  );
}
function PointStats({ p }: { p: EfficientFrontierPoint }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {[
        { key: 'Expected Return', value: fmtPct(p.expectedReturn), color: COLORS.success },
        { key: 'Expected Volatility', value: fmtPct(p.expectedVolatility), color: COLORS.warning },
        { key: 'Sharpe Ratio', value: p.sharpeRatio.toFixed(2), color: COLORS.brand },
      ].map((s) => (
        <MiniStatCard
          key={s.key}
          className="bg-elevated p-2.5"
          label={t(s.key)}
          value={s.value}
          color={s.color}
        />
      ))}
    </div>
  );
}
function SelectedPointDetail({
  selectedPoint,
  onLoadInBacktester,
}: {
  selectedPoint: EfficientFrontierPoint | null;
  onLoadInBacktester: (p: EfficientFrontierPoint) => void;
}) {
  const { t } = useTranslation();
  if (!selectedPoint) return null;
  return (
    <div className="mt-4 rounded-md bg-input-bg p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-label font-semibold text-fg">{t('Selected Portfolio Details')}</h3>
        <LoadInBacktesterButton
          onClick={() => onLoadInBacktester(selectedPoint)}
          label={t('Load')}
          size="sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeightAllocation weights={selectedPoint.weights} title={t('Weight Allocation')} />
        <PointStats p={selectedPoint} />
      </div>
    </div>
  );
}
function MaxSharpeSection({ maxSharpe }: { maxSharpe: EfficientFrontierPoint | undefined }) {
  const { t } = useTranslation();
  if (!maxSharpe) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Max Sharpe Portfolio')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeightAllocation weights={maxSharpe.weights} title={t('Weight')} />
        <div className="flex flex-col gap-3">
          <PointStats p={maxSharpe} />
        </div>
      </div>
    </div>
  );
}
function ParamsSummary({
  rebalanceFrequency,
  allowCash,
  returnObjective,
  solver,
}: {
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Parameters Summary')}</h3>
      <MetricsGrid
        metrics={[
          {
            label: t('Rebalancing Frequency'),
            value:
              t(`efficientFrontier.rebalanceFreq.${rebalanceFrequency}`, { defaultValue: '' }) ||
              rebalanceFrequency,
            color: COLORS.fgSec,
          },
          {
            label: t('Allow Cash Allocation'),
            value: allowCash ? t('Yes') : t('No'),
            color: allowCash ? COLORS.success : COLORS.fgTer,
          },
          {
            label: t('Return Objective'),
            value: returnObjective === 'maxCagr' ? t('Max CAGR') : t('Min Vol'),
            color: COLORS.fgSec,
          },
          {
            label: t('Solver'),
            value: t(`efficientFrontier.solver.${solver}`, { defaultValue: solver }),
            color: COLORS.fgSec,
          },
        ]}
      />
    </div>
  );
}
function FrontierResults({ state }: { state: FrontierState }) {
  const {
    results: r,
    scatterData,
    sharpeRange,
    maxSharpe,
    allocationData,
    allAssetTickers,
    correlations,
    selectedPoint,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    setSelectedPoint,
    handleLoadInBacktester,
  } = state;
  return (
    <div className="flex flex-col gap-6">
      <FrontierScatterChart
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={r?.frontier ?? []}
        onSelectPoint={setSelectedPoint}
        onLoadInBacktester={() => handleLoadInBacktester()}
      />
      <FrontierAllocations allocationData={allocationData} allAssetTickers={allAssetTickers} />
      <CorrelationMatrixView correlations={correlations} />
      <SelectedPointDetail
        selectedPoint={selectedPoint}
        onLoadInBacktester={handleLoadInBacktester}
      />
      <MaxSharpeSection maxSharpe={maxSharpe} />
      <ParamsSummary
        rebalanceFrequency={rebalanceFrequency}
        allowCash={allowCash}
        returnObjective={returnObjective}
        solver={solver}
      />
    </div>
  );
}
function FrontierResultsView({ state }: { state: FrontierState }) {
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={state.error}
      errorPrefix={`${t('Calculation failed')}: `}
      isLoading={state.isLoading}
      hasResults={!!state.results && state.results.frontier.length > 0}
      loadingLabel={t('Calculating...')}
      emptyTitle={t('Set parameters and click "Calculate Efficient Frontier" to view results')}
      onRetry={state.runFrontier}
    >
      <div className="flex flex-col gap-3">
        {state.correlationError && !state.error && (
          <ErrorBanner message={state.correlationError} variant="warning" />
        )}
        {state.results && state.results.frontier.length > 0 && <FrontierResults state={state} />}
      </div>
    </ResultsShell>
  );
}
export default createComputeToolPage(useEfficientFrontierState, {
  titleKey: 'nav.efficientFrontier',
  seoDescKey: 'efficientFrontier.seo.desc',
  seoFeatures: [
    {
      titleKey: 'efficientFrontier.seo.visualizationTitle',
      descKey: 'efficientFrontier.seo.visualizationDesc',
    },
    { titleKey: 'Constraints', descKey: 'efficientFrontier.seo.constraintsDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.optimizer, TOOL_LINKS.analysis],
  params: FrontierParams,
  results: FrontierResultsView,
});
