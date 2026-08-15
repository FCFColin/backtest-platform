import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { type EfficientFrontierPoint, type EfficientFrontierResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { ErrorBanner } from '@/components/stateDisplay';
import { ResultsShell } from '@/components/resultsShell';
import { Button } from '@/components/ui/uiComponents';
import {
  CorrelationMatrixView,
  FrontierAllocations,
  FrontierScatterChart,
} from './EfficientFrontierCharts.js';
import { FrontierParams } from './EfficientFrontierParams.js';
import type { ReturnObjective, FrontierSolver } from './EfficientFrontierParams.js';
import { useEfficientFrontierState, type FrontierState } from './EfficientFrontierUtils.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { MiniStatCard } from '../../components/cards.js';
import { fmtPct } from '@/utils/format';
export interface FrontierResultsProps {
  results: EfficientFrontierResult;
  scatterData: Array<{
    expectedVolatility: number;
    expectedReturn: number;
    sharpeRatio: number;
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
    { key: 'Expected Return', value: fmtPct(p.expectedReturn), color: COLOR_SUCCESS },
    {
      key: 'Expected Volatility',
      value: fmtPct(p.expectedVolatility),
      color: COLOR_WARNING,
    },
    { key: 'Sharpe Ratio', value: p.sharpeRatio.toFixed(2), color: COLOR_BRAND },
  ];
  return (
    <div className="flex flex-col gap-2">
      {stats.map((s) => (
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
  returnObjective: FrontierResultsProps['returnObjective'];
  solver: FrontierResultsProps['solver'];
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Parameters Summary')}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStatCard
          label={t('Rebalancing Frequency')}
          value={
            t(`efficientFrontier.rebalanceFreq.${rebalanceFrequency}`, { defaultValue: '' }) ||
            rebalanceFrequency
          }
          color={COLOR_FG_SECONDARY}
        />
        <MiniStatCard
          label={t('Allow Cash Allocation')}
          value={allowCash ? t('Yes') : t('No')}
          color={allowCash ? COLOR_SUCCESS : COLOR_FG_TERTIARY}
        />
        <MiniStatCard
          label={t('Return Objective')}
          value={returnObjective === 'maxCagr' ? t('Max CAGR') : t('Min Vol')}
          color={COLOR_FG_SECONDARY}
        />
        <MiniStatCard
          label={t('Solver')}
          value={t(`efficientFrontier.solver.${solver}`, { defaultValue: solver })}
          color={COLOR_FG_SECONDARY}
        />
      </div>
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
const config: ComputeToolConfig<FrontierState> = {
  titleKey: 'nav.efficientFrontier',
  seoDescKey: 'efficientFrontier.seo.desc',
  seoFeatures: [
    {
      titleKey: 'efficientFrontier.seo.visualizationTitle',
      descKey: 'efficientFrontier.seo.visualizationDesc',
    },
    {
      titleKey: 'Constraints',
      descKey: 'efficientFrontier.seo.constraintsDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  params: FrontierParams,
  results: FrontierResultsView,
};
export default function EfficientFrontierPage() {
  const s = useEfficientFrontierState();
  return <ComputeToolShell config={config} state={s} />;
}
