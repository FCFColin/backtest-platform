import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import {
  CHART_COLORS,
  type EfficientFrontierPoint,
  type EfficientFrontierResult,
} from '@backtest/shared';
import { ErrorBanner } from '@/components/stateDisplay';
import { Button } from '@/components/ui/uiComponents';
import {
  CorrelationMatrixView,
  FrontierAllocations,
  FrontierScatterChart,
} from './EfficientFrontierCharts.js';
import { FrontierParams } from './EfficientFrontierParams.js';
import type { ReturnObjective, FrontierSolver } from './EfficientFrontierParams.js';
import { useEfficientFrontierState } from './EfficientFrontierUtils.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { MiniStatCard } from '../../components/cards.js';
export interface FrontierResultsProps {
  results: EfficientFrontierResult;
  scatterData: Array<{
    expectedVolatility: number;
    expectedReturn: number;
    sharpeRatio: number;
    idx: number;
  }>;
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
  correlations: { tickers: string[]; matrix: number[][] } | null;
  correlationError: string | null;
  selectedPoint: EfficientFrontierPoint | null;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: (p?: EfficientFrontierPoint) => void;
}
export function WeightBar({
  ticker,
  weight,
  color,
}: {
  ticker: string;
  weight: number;
  color: string;
}) {
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
        {(weight * 100).toFixed(1)}%
      </span>
    </div>
  );
}
export function WeightAllocation({
  weights,
  title,
}: {
  weights: Record<string, number>;
  title: string;
}) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([ticker, weight], i) => (
          <WeightBar
            key={ticker}
            ticker={ticker}
            weight={weight}
            color={CHART_COLORS[i % CHART_COLORS.length]}
          />
        ))}
      </div>
    </div>
  );
}
export function LoadInBacktesterButton({
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
const COLOR_SUCCESS = 'hsl(var(--success))';
const COLOR_WARNING = 'hsl(var(--warning))';
const COLOR_BRAND = 'hsl(var(--brand))';
const COLOR_FG_SECONDARY = 'hsl(var(--fg-secondary))';
const COLOR_FG_TERTIARY = 'hsl(var(--fg-tertiary))';
function PointStats({ p }: { p: EfficientFrontierPoint }) {
  const { t } = useTranslation();
  const stats = [
    { key: 'expectedReturn', value: `${p.expectedReturn.toFixed(2)}%`, color: COLOR_SUCCESS },
    {
      key: 'expectedVolatility',
      value: `${p.expectedVolatility.toFixed(2)}%`,
      color: COLOR_WARNING,
    },
    { key: 'sharpeRatio', value: p.sharpeRatio.toFixed(2), color: COLOR_BRAND },
  ];
  return (
    <div className="flex flex-col gap-2">
      {stats.map((s) => (
        <MiniStatCard
          key={s.key}
          className="bg-elevated p-2.5"
          label={t(`efficientFrontier.results.${s.key}`)}
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
        <h3 className="text-label font-semibold text-fg">
          {t('efficientFrontier.results.selectedPoint')}
        </h3>
        <LoadInBacktesterButton
          onClick={() => onLoadInBacktester(selectedPoint)}
          label={t('efficientFrontier.results.load')}
          size="sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeightAllocation
          weights={selectedPoint.weights}
          title={t('efficientFrontier.results.weightAllocation')}
        />
        <div className="flex flex-col gap-2">
          <MiniStatCard
            className="bg-elevated p-2.5"
            label={t('efficientFrontier.results.expectedReturn')}
            value={`${selectedPoint.expectedReturn.toFixed(2)}%`}
            color={COLOR_SUCCESS}
          />
          <MiniStatCard
            className="bg-elevated p-2.5"
            label={t('efficientFrontier.results.expectedVolatility')}
            value={`${selectedPoint.expectedVolatility.toFixed(2)}%`}
            color={COLOR_WARNING}
          />
          <MiniStatCard
            className="bg-elevated p-2.5"
            label={t('efficientFrontier.results.sharpeRatio')}
            value={selectedPoint.sharpeRatio.toFixed(2)}
            color={COLOR_BRAND}
          />
        </div>
      </div>
    </div>
  );
}
function MaxSharpeSection({ maxSharpe }: { maxSharpe: EfficientFrontierPoint | undefined }) {
  const { t } = useTranslation();
  if (!maxSharpe) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.maxSharpePortfolio')}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeightAllocation
          weights={maxSharpe.weights}
          title={t('efficientFrontier.results.weight')}
        />
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
  returnObjective: FrontierResultsProps['returnObjective'];
  solver: FrontierResultsProps['solver'];
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.paramsSummary')}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('efficientFrontier.results.rebalanceFreq')}
          value={
            t(`efficientFrontier.rebalanceFreq.${rebalanceFrequency}`, { defaultValue: '' }) ||
            rebalanceFrequency
          }
          color={COLOR_FG_SECONDARY}
        />
        <StatCard
          label={t('efficientFrontier.results.allowCash')}
          value={allowCash ? t('efficientFrontier.results.yes') : t('efficientFrontier.results.no')}
          color={allowCash ? COLOR_SUCCESS : COLOR_FG_TERTIARY}
        />
        <StatCard
          label={t('efficientFrontier.results.returnObjective')}
          value={
            returnObjective === 'maxCagr'
              ? t('efficientFrontier.results.maxCagrShort')
              : t('efficientFrontier.results.minVolShort')
          }
          color={COLOR_FG_SECONDARY}
        />
        <StatCard
          label={t('efficientFrontier.results.solver')}
          value={t(`efficientFrontier.solver.${solver}`, { defaultValue: solver })}
          color={COLOR_FG_SECONDARY}
        />
      </div>
    </div>
  );
}
export function FrontierResults(props: FrontierResultsProps) {
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
    onSelectPoint,
    onLoadInBacktester,
  } = props;
  return (
    <div className="flex flex-col gap-6">
      <FrontierScatterChart
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={r.frontier}
        onSelectPoint={onSelectPoint}
        onLoadInBacktester={() => onLoadInBacktester()}
      />
      <FrontierAllocations allocationData={allocationData} allAssetTickers={allAssetTickers} />
      <CorrelationMatrixView correlations={correlations} />
      <SelectedPointDetail selectedPoint={selectedPoint} onLoadInBacktester={onLoadInBacktester} />
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
type FrontierState = ReturnType<typeof useEfficientFrontierState>;
function FrontierParamsWrapper({ state }: { state: FrontierState }) {
  return (
    <FrontierParams
      tickers={state.tickers}
      startDate={state.startDate}
      endDate={state.endDate}
      numPoints={state.numPoints}
      solveSpeed={state.solveSpeed}
      minInclusionWeight={state.minInclusionWeight}
      rebalanceFrequency={state.rebalanceFrequency}
      allowCash={state.allowCash}
      returnObjective={state.returnObjective}
      solver={state.solver}
      onAddTicker={state.addTicker}
      onRemoveTicker={state.removeTicker}
      onUpdateTicker={state.updateTicker}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onNumPointsChange={state.setNumPoints}
      onSolveSpeedChange={state.setSolveSpeed}
      onMinInclusionWeightChange={state.setMinInclusionWeight}
      onRebalanceFrequencyChange={state.setRebalanceFrequency}
      onAllowCashChange={state.setAllowCash}
      onReturnObjectiveChange={state.setReturnObjective}
      onSolverChange={state.setSolver}
      isLoading={state.isLoading}
      onRun={state.runFrontier}
    />
  );
}
function FrontierResultsWrapper({ state }: { state: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      {state.error && (
        <ErrorBanner
          message={`${t('efficientFrontier.calcFailed')}: ${state.error}`}
          variant="error"
        />
      )}
      {state.correlationError && !state.error && (
        <ErrorBanner message={state.correlationError} variant="warning" />
      )}
      {state.results && state.results.frontier.length > 0 && (
        <FrontierResults
          results={state.results}
          scatterData={state.scatterData}
          sharpeRange={state.sharpeRange}
          maxSharpe={state.maxSharpe}
          allocationData={state.allocationData}
          allAssetTickers={state.allAssetTickers}
          correlations={state.correlations}
          correlationError={state.correlationError}
          selectedPoint={state.selectedPoint}
          rebalanceFrequency={state.rebalanceFrequency}
          allowCash={state.allowCash}
          returnObjective={state.returnObjective}
          solver={state.solver}
          onSelectPoint={state.setSelectedPoint}
          onLoadInBacktester={state.handleLoadInBacktester}
        />
      )}
    </div>
  );
}
const config: ComputeToolConfig<FrontierState> = {
  titleKey: 'efficientFrontier.title',
  seoDescKey: 'efficientFrontier.seo.desc',
  seoFeatures: [
    {
      titleKey: 'efficientFrontier.seo.visualizationTitle',
      descKey: 'efficientFrontier.seo.visualizationDesc',
    },
    {
      titleKey: 'efficientFrontier.seo.constraintsTitle',
      descKey: 'efficientFrontier.seo.constraintsDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  params: FrontierParamsWrapper,
  results: FrontierResultsWrapper,
};
export default function EfficientFrontierPage() {
  const s = useEfficientFrontierState();
  return <ComputeToolShell config={config} state={s} />;
}
