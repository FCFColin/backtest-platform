/* eslint-disable react-refresh/only-export-components */
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { createComputeToolPage } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useMemo, useState } from 'react';
import i18n from '@/i18n/index.js';
import { useNavigate } from 'react-router';
import { useAsyncAction, useSetterState } from '../../hooks/miscHooks.js';
import { apiFetch, apiPostJSON } from '@/utils/apiClient';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import {
  buildBacktestParameters,
  buildSinglePortfolioBody,
  DEFAULT_BACKTEST_START_DATE,
  DEFAULT_END_DATE,
} from '@/utils/constants';
type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
type FrontierSolver = 'markowitz' | 'nsga2';
type ReturnObjective = 'maxCagr' | 'minVolatility';
function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return 'hsl(var(--success))';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}
function buildPortfolioData(
  p: EfficientFrontierPoint,
  rebalanceFrequency: string,
  startDate: string,
  endDate: string,
) {
  return buildSinglePortfolioBody(
    i18n.t('Portfolio'),
    Object.entries(p.weights).map(([ticker, weight]) => ({
      ticker,
      weight: Math.round(weight * 10000) / 100,
    })),
    { id: `portfolio-${Date.now()}-1`, rebalanceFrequency: rebalanceFrequency || 'quarterly' },
    buildBacktestParameters(startDate, endDate),
  );
}
async function fetchFrontier(params: {
  validTickers: string[];
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  startDate: string;
  endDate: string;
}): Promise<EfficientFrontierResult> {
  return apiPostJSON<EfficientFrontierResult>(
    '/api/v1/backtest/efficient-frontier',
    {
      tickers: params.validTickers,
      numPoints: params.numPoints,
      solveSpeed: params.solveSpeed,
      minInclusionWeight: params.minInclusionWeight / 100,
      rebalanceFrequency: params.rebalanceFrequency,
      allowCash: params.allowCash,
      returnObjective: params.returnObjective,
      solver: params.solver,
      parameters: buildBacktestParameters(params.startDate, params.endDate),
    },
    i18n.t('Calculation failed'),
  );
}
async function fetchCorrelations(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ tickers: string[]; matrix: number[][] } | null> {
  const btBody = buildSinglePortfolioBody(
    'temp',
    validTickers.map((t) => ({
      ticker: t,
      weight: Math.round((100 / validTickers.length) * 100) / 100,
    })),
    { rebalanceFrequency: 'yearly' },
    buildBacktestParameters(startDate, endDate),
  );
  const btRes = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!btRes.ok) return null;
  const btJson = await btRes.json(),
    btData = btJson.data ?? btJson;
  if (btData.assetTickers && btData.assetCorrelations)
    return { tickers: btData.assetTickers, matrix: btData.assetCorrelations };
  return null;
}
function computeFrontierDerivedData(results: EfficientFrontierResult | null) {
  const maxSharpe = results?.frontier.length
    ? results.frontier.reduce(
        (best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best),
        results.frontier[0],
      )
    : undefined;
  const sharpeRange = results?.frontier.length
    ? {
        min: Math.min(...results.frontier.map((p) => p.sharpeRatio)),
        max: Math.max(...results.frontier.map((p) => p.sharpeRatio)),
      }
    : { min: 0, max: 1 };
  const scatterData = results
    ? results.frontier.map((p) => ({
        expectedVolatility: Number((p.expectedVolatility * 100).toFixed(2)),
        expectedReturn: Number((p.expectedReturn * 100).toFixed(2)),
        sharpeRatio: p.sharpeRatio,
      }))
    : [];
  const allocationData = results
    ? results.frontier.map((point, idx) => {
        const row: Record<string, number | string> = { point: idx + 1 };
        Object.entries(point.weights).forEach(([ticker, weight]) => {
          row[ticker] = Number((weight * 100).toFixed(1));
        });
        return row;
      })
    : [];
  return {
    maxSharpe,
    sharpeRange,
    scatterData,
    allocationData,
    allAssetTickers: results?.frontier.length ? Object.keys(results.frontier[0].weights) : [],
  };
}
function useEfficientFrontierStateInner() {
  const navigate = useNavigate();
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND', 'TLT']);
  const { startDate, setStartDate, endDate, setEndDate, results, setResults } = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    isLoading: false,
    error: null as string | null,
    results: null as EfficientFrontierResult | null,
  });
  const s = useSetterState({
    numPoints: 20,
    solveSpeed: 'fast' as SolveSpeed,
    minInclusionWeight: 0,
    selectedPoint: null as EfficientFrontierPoint | null,
    correlations: null as { tickers: string[]; matrix: number[][] } | null,
    correlationError: null as string | null,
    rebalanceFrequency: 'yearly',
    allowCash: false,
    returnObjective: 'maxCagr' as ReturnObjective,
    solver: 'markowitz' as FrontierSolver,
  });
  const { isLoading, error, run, setError } = useAsyncAction();
  return {
    navigate,
    tickers,
    setTickers,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
    ...s,
  };
}
function useEfficientFrontierState() {
  const s = useEfficientFrontierStateInner();
  const { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers } = useMemo(
    () => computeFrontierDerivedData(s.results),
    [s.results],
  );
  const runFrontier = () => {
    const validTickers = s.tickers.filter(Boolean);
    if (validTickers.length < 2) {
      s.setError(i18n.t('Please enter at least two ticker symbols'));
      return;
    }
    s.setSelectedPoint(null);
    s.setCorrelations(null);
    s.setCorrelationError(null);
    s.run(async () => {
      const data = await fetchFrontier({
        validTickers,
        numPoints: s.numPoints,
        solveSpeed: s.solveSpeed,
        minInclusionWeight: s.minInclusionWeight,
        rebalanceFrequency: s.rebalanceFrequency,
        allowCash: s.allowCash,
        returnObjective: s.returnObjective,
        solver: s.solver,
        startDate: s.startDate,
        endDate: s.endDate,
      });
      s.setResults(data);
      const corr = await fetchCorrelations(validTickers, s.startDate, s.endDate);
      if (corr) s.setCorrelations(corr);
      else s.setCorrelationError(i18n.t('Correlation matrix computation failed'));
    });
  };
  const handleLoadInBacktester = (point?: EfficientFrontierPoint) => {
    const p = point || maxSharpe;
    if (!p) return;
    localStorage.setItem(
      'bt_load_from_optimizer',
      JSON.stringify(buildPortfolioData(p, s.rebalanceFrequency, s.startDate, s.endDate)),
    );
    s.navigate('/');
  };
  return {
    ...s,
    maxSharpe,
    sharpeRange,
    scatterData,
    allocationData,
    allAssetTickers,
    runFrontier,
    handleLoadInBacktester,
  };
}
type FrontierState = ReturnType<typeof useEfficientFrontierState>;
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
      <section className="flex flex-col gap-4">
        <SectionHeader title={t('Parameters')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DateField
            label={t('Start Date')}
            value={state.startDate}
            onChange={state.setStartDate}
          />
          <DateField label={t('End Date')} value={state.endDate} onChange={state.setEndDate} />
          <FieldShell>
            <FieldLabel>{t('Sample Points')}</FieldLabel>
            <Input
              type="number"
              min={5}
              max={100}
              value={state.numPoints}
              onChange={(e) => state.setNumPoints(Number(e.target.value))}
            />
          </FieldShell>
          <FieldShell>
            <AllHistoryCheckbox
              startDate={state.startDate}
              endDate={state.endDate}
              onStartDateChange={state.setStartDate}
              onEndDateChange={state.setEndDate}
              label={t('All History')}
            />
          </FieldShell>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label={t('Solve Speed')}
            value={state.solveSpeed}
            onChange={state.setSolveSpeed}
            options={[
              { value: 'ultrafast', label: t('Ultra Fast') },
              { value: 'fast', label: t('Fast') },
              { value: 'medium', label: t('Medium') },
              { value: 'slow', label: t('Slow') },
            ]}
          />
          <FieldShell>
            <FieldLabel>{t('Min Inclusion Weight')}</FieldLabel>
            <AffixInput
              type="number"
              min={0}
              max={100}
              suffix="%"
              value={state.minInclusionWeight}
              onChange={(e) => state.setMinInclusionWeight(Number(e.target.value))}
            />
          </FieldShell>
          <SelectField
            label={t('Rebalancing Frequency')}
            value={state.rebalanceFrequency}
            onChange={state.setRebalanceFrequency}
            options={[
              { value: 'daily', label: t('Daily') },
              { value: 'weekly', label: t('Weekly') },
              { value: 'monthly', label: t('Monthly') },
              { value: 'quarterly', label: t('Quarterly') },
              { value: 'yearly', label: t('Annual') },
            ]}
          />
          <SelectField
            label={t('Return Objective')}
            value={state.returnObjective}
            onChange={state.setReturnObjective}
            options={[
              { value: 'maxCagr', label: t('backtest.optimizer.maxCagr') },
              { value: 'minVolatility', label: t('Minimize Volatility') },
            ]}
          />
          <SelectField
            label={t('Solver')}
            value={state.solver}
            onChange={state.setSolver}
            options={[
              { value: 'markowitz', label: t('Markowitz') },
              { value: 'nsga2', label: t('NSGA-II') },
            ]}
          />
          <FieldShell>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
              <Checkbox
                checked={state.allowCash}
                onCheckedChange={(c) => state.setAllowCash(c === true)}
              />
              <span>{t('Allow Cash Allocation')}</span>
            </label>
          </FieldShell>
        </div>
      </section>
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
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-fg">{t('nav.efficientFrontier')}</h3>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label={t('Load in backtester')} />
      </div>
      <XYScatterChart
        xKey="expectedVolatility"
        yKey="expectedReturn"
        xName={t('Volatility (%)')}
        yName={t('Return (%)')}
        zRange={[60, 60]}
        height={400}
        tooltipFormatter={(v: number) => `${v.toFixed(2)}%`}
        series={scatterSeries}
        onClick={({ seriesIndex }) => {
          const p = seriesIndex !== undefined ? (frontier[seriesIndex] ?? maxSharpe) : undefined;
          if (p) onSelectPoint(p);
        }}
      />
    </div>
  );
}
function FrontierResults({ state }: { state: FrontierState }) {
  const { t } = useTranslation();
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
      {allocationData.length > 0 && allAssetTickers.length > 0 && (
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
      )}
      {correlations && correlations.tickers.length >= 2 && (
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
      )}
      {selectedPoint && (
        <div className="mt-4 rounded-md bg-input-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-label font-semibold text-fg">{t('Selected Portfolio Details')}</h3>
            <LoadInBacktesterButton
              onClick={() => handleLoadInBacktester(selectedPoint)}
              label={t('Load')}
              size="sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WeightAllocation weights={selectedPoint.weights} title={t('Weight Allocation')} />
            <PointStats p={selectedPoint} />
          </div>
        </div>
      )}
      {maxSharpe && (
        <div>
          <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Max Sharpe Portfolio')}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WeightAllocation weights={maxSharpe.weights} title={t('Weight')} />
            <div className="flex flex-col gap-3">
              <PointStats p={maxSharpe} />
            </div>
          </div>
        </div>
      )}
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
function WeightAllocation({ weights, title }: { weights: Record<string, number>; title: string }) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([ticker, weight], i) => (
          <div key={ticker} className="flex items-center gap-2">
            <span className="w-[60px] shrink-0 text-label font-medium text-fg">{ticker}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
              <div
                className="h-full rounded-sm"
                style={{ width: `${weight * 100}%`, backgroundColor: getPortfolioColor(i) }}
              />
            </div>
            <span className="font-mono text-caption tabular-nums text-fg-tertiary">
              {fmtPct(weight, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function PointStats({ p }: { p: EfficientFrontierPoint }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <MiniStatCard
        className="bg-elevated p-2.5"
        label={t('Expected Return')}
        value={fmtPct(p.expectedReturn)}
        color={COLORS.success}
      />
      <MiniStatCard
        className="bg-elevated p-2.5"
        label={t('Expected Volatility')}
        value={fmtPct(p.expectedVolatility)}
        color={COLORS.warning}
      />
      <MiniStatCard
        className="bg-elevated p-2.5"
        label={t('Sharpe Ratio')}
        value={p.sharpeRatio.toFixed(2)}
        color={COLORS.brand}
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
