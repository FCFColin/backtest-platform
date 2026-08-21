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
const SOLVE_OPTS: [SolveSpeed, string][] = [
  ['ultrafast', 'Ultra Fast'],
  ['fast', 'Fast'],
  ['medium', 'Medium'],
  ['slow', 'Slow'],
];
const REBAL_OPTS: [string, string][] = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['yearly', 'Annual'],
];
const RET_OPTS: [ReturnObjective, string][] = [
  ['maxCagr', 'backtest.optimizer.maxCagr'],
  ['minVolatility', 'Minimize Volatility'],
];
const SOLVER_OPTS: [FrontierSolver, string][] = [
  ['markowitz', 'Markowitz'],
  ['nsga2', 'NSGA-II'],
];
const toOpts = <V extends string>(a: readonly (readonly [V, string])[], t: (k: string) => string) =>
  a.map(([v, l]) => ({ value: v, label: t(l) }));
const sColor = (s: number, lo: number, hi: number) =>
  hi === lo
    ? 'hsl(var(--success))'
    : ((t) =>
        `rgb(${t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 440)},${t < 0.5 ? Math.round(t * 360) : 180},${t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 74)})`)(
        Math.max(0, Math.min(1, (s - lo) / (hi - lo))),
      );
function computeFrontierDerivedData(r: EfficientFrontierResult | null) {
  const f = r?.frontier ?? [];
  const maxSharpe = f.length
    ? f.reduce((b, p) => (p.sharpeRatio > b.sharpeRatio ? p : b), f[0])
    : undefined;
  const sharpeRange = f.length
    ? {
        min: Math.min(...f.map((p) => p.sharpeRatio)),
        max: Math.max(...f.map((p) => p.sharpeRatio)),
      }
    : { min: 0, max: 1 };
  const scatterData = f.map((p) => ({
    expectedVolatility: +(p.expectedVolatility * 100).toFixed(2),
    expectedReturn: +(p.expectedReturn * 100).toFixed(2),
    sharpeRatio: p.sharpeRatio,
  }));
  const allocationData = f.map((pt, i) => {
    const row: Record<string, number | string> = { point: i + 1 };
    Object.entries(pt.weights).forEach(([k, v]) => {
      row[k] = +(v * 100).toFixed(1);
    });
    return row;
  });
  return {
    maxSharpe,
    sharpeRange,
    scatterData,
    allocationData,
    allAssetTickers: f.length ? Object.keys(f[0].weights) : [],
  };
}
function useEfficientFrontierStateInner() {
  const nav = useNavigate();
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
    nav,
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
    const v = s.tickers.filter(Boolean);
    if (v.length < 2) {
      s.setError(i18n.t('Please enter at least two ticker symbols'));
      return;
    }
    s.setSelectedPoint(null);
    s.setCorrelations(null);
    s.setCorrelationError(null);
    s.run(async () => {
      const data = await apiPostJSON<EfficientFrontierResult>(
        '/api/v1/backtest/efficient-frontier',
        {
          tickers: v,
          numPoints: s.numPoints,
          solveSpeed: s.solveSpeed,
          minInclusionWeight: s.minInclusionWeight / 100,
          rebalanceFrequency: s.rebalanceFrequency,
          allowCash: s.allowCash,
          returnObjective: s.returnObjective,
          solver: s.solver,
          parameters: buildBacktestParameters(s.startDate, s.endDate),
        },
        i18n.t('Calculation failed'),
      );
      s.setResults(data);
      const btBody = buildSinglePortfolioBody(
        'temp',
        v.map((t) => ({ ticker: t, weight: Math.round((100 / v.length) * 100) / 100 })),
        { rebalanceFrequency: 'yearly' },
        buildBacktestParameters(s.startDate, s.endDate),
      );
      const btRes = await apiFetch('/api/v1/backtest/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(btBody),
      });
      if (!btRes.ok) {
        s.setCorrelationError(i18n.t('Correlation matrix computation failed'));
        return;
      }
      const btJson = await btRes.json(),
        d = btJson.data ?? btJson;
      if (d.assetTickers && d.assetCorrelations)
        s.setCorrelations({ tickers: d.assetTickers, matrix: d.assetCorrelations });
      else s.setCorrelationError(i18n.t('Correlation matrix computation failed'));
    });
  };
  const handleLoadInBacktester = (p?: EfficientFrontierPoint) => {
    const pt = p || maxSharpe;
    if (!pt) return;
    localStorage.setItem(
      'bt_load_from_optimizer',
      JSON.stringify(
        buildSinglePortfolioBody(
          i18n.t('Portfolio'),
          Object.entries(pt.weights).map(([ticker, weight]) => ({
            ticker,
            weight: Math.round(weight * 10000) / 100,
          })),
          {
            id: `portfolio-${Date.now()}-1`,
            rebalanceFrequency: s.rebalanceFrequency || 'quarterly',
          },
          buildBacktestParameters(s.startDate, s.endDate),
        ),
      ),
    );
    s.nav('/');
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
function FrontierParams({ state: s }: { state: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <AssetSelectionField
        tickers={s.tickers.filter(Boolean)}
        onChange={s.setTickers}
        minCount={2}
        title={t('Ticker List')}
      />
      <section className="flex flex-col gap-4">
        <SectionHeader title={t('Parameters')} />
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label={t('Solve Speed')}
            value={s.solveSpeed}
            onChange={s.setSolveSpeed}
            options={toOpts(SOLVE_OPTS, t)}
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
            options={toOpts(REBAL_OPTS, t)}
          />
          <SelectField
            label={t('Return Objective')}
            value={s.returnObjective}
            onChange={s.setReturnObjective}
            options={toOpts(RET_OPTS, t)}
          />
          <SelectField
            label={t('Solver')}
            value={s.solver}
            onChange={s.setSolver}
            options={toOpts(SOLVER_OPTS, t)}
          />
          <FieldShell>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
              <Checkbox checked={s.allowCash} onCheckedChange={(c) => s.setAllowCash(c === true)} />
              <span>{t('Allow Cash Allocation')}</span>
            </label>
          </FieldShell>
        </div>
      </section>
      <RunButton
        isLoading={s.isLoading}
        onClick={s.runFrontier}
        label={t('Calculate Efficient Frontier')}
        loadingLabel={t('Calculating...')}
      />
    </div>
  );
}
function LoadBtn({
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
  maxSharpe?: EfficientFrontierPoint;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: () => void;
}) {
  const { t } = useTranslation();
  const series: XYScatterSeriesSpec[] = scatterData.map((e) => ({
    data: [e],
    color: sColor(e.sharpeRatio, sharpeRange.min, sharpeRange.max),
    symbolSize: 6,
  }));
  if (maxSharpe)
    series.push({
      data: [
        {
          expectedVolatility: +(maxSharpe.expectedVolatility * 100).toFixed(2),
          expectedReturn: +(maxSharpe.expectedReturn * 100).toFixed(2),
          sharpeRatio: maxSharpe.sharpeRatio,
        },
      ],
      color: getPortfolioColor(0),
      symbol: 'star',
      symbolSize: 12,
    });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-fg">{t('nav.efficientFrontier')}</h3>
        <LoadBtn onClick={onLoadInBacktester} label={t('Load in backtester')} />
      </div>
      <XYScatterChart
        xKey="expectedVolatility"
        yKey="expectedReturn"
        xName={t('Volatility (%)')}
        yName={t('Return (%)')}
        zRange={[60, 60]}
        height={400}
        tooltipFormatter={(v: number) => `${v.toFixed(2)}%`}
        series={series}
        onClick={({ seriesIndex }) => {
          const p = seriesIndex !== undefined ? (frontier[seriesIndex] ?? maxSharpe) : undefined;
          if (p) onSelectPoint(p);
        }}
      />
    </div>
  );
}
function FrontierResults({ state: s }: { state: FrontierState }) {
  const { t } = useTranslation();
  const {
    results: r,
    scatterData,
    sharpeRange,
    maxSharpe,
    allocationData,
    allAssetTickers: tickers,
    correlations: corr,
    selectedPoint: sel,
    rebalanceFrequency: rf,
    allowCash: ac,
    returnObjective: ro,
    solver: sv,
    setSelectedPoint,
    handleLoadInBacktester: load,
  } = s;
  return (
    <div className="flex flex-col gap-6">
      <FrontierScatterChart
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={r?.frontier ?? []}
        onSelectPoint={setSelectedPoint}
        onLoadInBacktester={() => load()}
      />
      {allocationData.length > 0 && tickers.length > 0 && (
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
            series={tickers.map((ticker, i) => ({
              dataKey: ticker,
              color: getPortfolioColor(i),
              stackId: '1',
              areaOpacity: 0.8,
            }))}
          />
          <div className="mt-2 flex flex-wrap justify-center gap-4">
            {tickers.map((ticker, i) => (
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
      {corr && corr.tickers.length >= 2 && (
        <div>
          <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Correlation Matrix')}</h3>
          <MatrixHeatmap
            rowLabels={corr.tickers}
            columnLabels={corr.tickers}
            matrix={corr.matrix}
            getBackgroundColor={getCorrelationColor}
            getTextColor={getCorrelationTextColor}
            formatValue={(v) => v.toFixed(2)}
          />
        </div>
      )}
      {sel && (
        <div className="mt-4 rounded-md bg-input-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-label font-semibold text-fg">{t('Selected Portfolio Details')}</h3>
            <LoadBtn onClick={() => load(sel)} label={t('Load')} size="sm" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WeightAllocation weights={sel.weights} title={t('Weight Allocation')} />
            <PointStats p={sel} />
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
              value: t(`efficientFrontier.rebalanceFreq.${rf}`, { defaultValue: '' }) || rf,
              color: 'hsl(var(--fg-secondary))',
            },
            {
              label: t('Allow Cash Allocation'),
              value: ac ? t('Yes') : t('No'),
              color: ac ? 'hsl(var(--success))' : 'hsl(var(--fg-tertiary))',
            },
            {
              label: t('Return Objective'),
              value: ro === 'maxCagr' ? t('Max CAGR') : t('Min Vol'),
              color: 'hsl(var(--fg-secondary))',
            },
            {
              label: t('Solver'),
              value: t(`efficientFrontier.solver.${sv}`, { defaultValue: sv }),
              color: 'hsl(var(--fg-secondary))',
            },
          ]}
        />
      </div>
    </div>
  );
}
function WeightAllocation({ weights, title }: { weights: Record<string, number>; title: string }) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([tk, w], i) => (
          <div key={tk} className="flex items-center gap-2">
            <span className="w-[60px] shrink-0 text-label font-medium text-fg">{tk}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
              <div
                className="h-full rounded-sm"
                style={{ width: `${w * 100}%`, backgroundColor: getPortfolioColor(i) }}
              />
            </div>
            <span className="font-mono text-caption tabular-nums text-fg-tertiary">
              {fmtPct(w, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function PointStats({ p }: { p: EfficientFrontierPoint }) {
  const { t } = useTranslation();
  const rows: [string, string, string][] = [
    [t('Expected Return'), fmtPct(p.expectedReturn), 'hsl(var(--success))'],
    [t('Expected Volatility'), fmtPct(p.expectedVolatility), 'hsl(var(--warning))'],
    [t('Sharpe Ratio'), p.sharpeRatio.toFixed(2), 'hsl(var(--brand))'],
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, value, color]) => (
        <MiniStatCard
          key={label}
          className="bg-elevated p-2.5"
          label={label}
          value={value}
          color={color}
        />
      ))}
    </div>
  );
}
function FrontierResultsView({ state: s }: { state: FrontierState }) {
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Calculation failed')}: `}
      isLoading={s.isLoading}
      hasResults={!!s.results && s.results.frontier.length > 0}
      loadingLabel={t('Calculating...')}
      emptyTitle={t('Set parameters and click "Calculate Efficient Frontier" to view results')}
      onRetry={s.runFrontier}
    >
      <div className="flex flex-col gap-3">
        {s.correlationError && !s.error && (
          <ErrorBanner message={s.correlationError} variant="warning" />
        )}
        {s.results && s.results.frontier.length > 0 && <FrontierResults state={s} />}
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
