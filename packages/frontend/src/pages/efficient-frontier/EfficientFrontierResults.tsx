/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any -- ECharts 动态构造需 any */
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCorrelationColor, getPortfolioColor as portColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from '@/components/charts/chartUtils.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import { SimpleChart, XYScatterChart } from '@/components/charts/sharedChartContent.js';
import { Checkbox, Input, Button } from '@/components/ui/uiComponents';
import { Field as FieldShell, FieldLabel } from '@/components/form/Field';
import { SectionHeader, SelectField, RunButton, DateField } from '@/components/form/sharedFields';
import { PercentInput } from '@/components/form/sharedFields';
import { AssetSelectionField, AllHistoryCheckbox } from '@/components/params/toolFields.js';
import { ErrorBanner } from '@/components/stateDisplay';
import { ResultsShell } from '@/components/resultsShell';
import { MiniStatCard } from '../../components/cards.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { fmtPct } from '@/utils/format';
import { createComputeToolPage } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
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
const cvt = (s: string) => s.split(',').map((p) => p.split(':')) as [string, string][];
const C_OK = 'hsl(var(--success))',
  C_FG2 = 'hsl(var(--fg-secondary))',
  C_FG3 = 'hsl(var(--fg-tertiary))';
const toOpts = <V extends string>(a: readonly (readonly [V, string])[], t: (k: string) => string) =>
  a.map(([v, l]) => ({ value: v, label: t(l) }));
const sColor = (s: number, lo: number, hi: number) => {
  if (hi === lo) return 'hsl(var(--success))';
  const v = Math.max(0, Math.min(1, (s - lo) / (hi - lo)));
  return `rgb(${v < 0.5 ? 220 : Math.round(220 - (v - 0.5) * 440)},${v < 0.5 ? Math.round(v * 360) : 180},${v < 0.5 ? 50 : Math.round(50 + (v - 0.5) * 74)})`;
};
const pc = (p: EfficientFrontierPoint) => ({
  expectedVolatility: +(p.expectedVolatility * 100).toFixed(2),
  expectedReturn: +(p.expectedReturn * 100).toFixed(2),
  sharpeRatio: p.sharpeRatio,
});
const pctWeights = (w: Record<string, number>) =>
  Object.fromEntries(Object.entries(w).map(([k, x]) => [k, +(x * 100).toFixed(1)]));
function useEfficientFrontierState() {
  const nav = useNavigate(),
    s = useSetterState({
      tickers: ['VTI', 'VXUS', 'BND', 'TLT'],
      startDate: DEFAULT_BACKTEST_START_DATE,
      endDate: DEFAULT_END_DATE,
      results: null as EfficientFrontierResult | null,
      numPoints: 20,
      solveSpeed: 'fast',
      minInclusionWeight: 0,
      selectedPoint: null as EfficientFrontierPoint | null,
      correlations: null as { tickers: string[]; matrix: number[][] } | null,
      correlationError: null as string | null,
      rebalanceFrequency: 'yearly',
      allowCash: false,
      returnObjective: 'maxCagr',
      solver: 'markowitz',
    });
  const { run, setError, ...ua } = useAsyncAction(),
    f = s.results?.frontier ?? [],
    sp = f.map((p) => p.sharpeRatio);
  const derived = {
    maxSharpe: f[0] && f.reduce((b, p) => (p.sharpeRatio > b.sharpeRatio ? p : b)),
    sharpeRange: sp.length ? { min: Math.min(...sp), max: Math.max(...sp) } : { min: 0, max: 1 },
    scatterData: f.map(pc),
    allocationData: f.map((p, i) => ({ point: i + 1, ...pctWeights(p.weights) })),
    allAssetTickers: Object.keys(f[0]?.weights ?? {}),
  };
  const runFrontier = () => {
    const v = s.tickers.filter(Boolean);
    if (v.length < 2) return setError(i18n.t('Please enter at least two ticker symbols'));
    s.setSelectedPoint(null);
    s.setCorrelations(null);
    s.setCorrelationError(null);
    run(async () => {
      const btBody = buildSinglePortfolioBody(
        'temp',
        v.map((x) => ({ ticker: x, weight: Math.round((100 / v.length) * 100) / 100 })),
        { rebalanceFrequency: 'yearly' },
        buildBacktestParameters(s.startDate, s.endDate),
      );
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
      const r = await apiFetch('/api/v1/backtest/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(btBody),
      });
      const j = r.ok ? await r.json().then((x) => x.data ?? x) : null;
      if (j?.assetTickers && j.assetCorrelations)
        s.setCorrelations({ tickers: j.assetTickers, matrix: j.assetCorrelations });
      else s.setCorrelationError(i18n.t('Correlation matrix computation failed'));
    });
  };
  const handleLoadInBacktester = (p?: EfficientFrontierPoint) => {
    const q = p || derived.maxSharpe;
    if (!q) return;
    const body = buildSinglePortfolioBody(
      i18n.t('Portfolio'),
      Object.entries(q.weights).map(([k, w]) => ({ ticker: k, weight: Math.round(w * 1e4) / 100 })),
      { id: `portfolio-${Date.now()}-1`, rebalanceFrequency: s.rebalanceFrequency || 'quarterly' },
      buildBacktestParameters(s.startDate, s.endDate),
    );
    localStorage.setItem('bt_load_from_optimizer', JSON.stringify(body));
    nav('/');
  };
  return { ...ua, run: runFrontier, ...s, ...derived, handleLoadInBacktester };
}
function FrontierParams({ state: s }: { state: ReturnType<typeof useEfficientFrontierState> }) {
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
          {[
            [
              'Solve Speed',
              s.solveSpeed,
              s.setSolveSpeed,
              cvt('ultrafast:Ultra Fast,fast:Fast,medium:Medium,slow:Slow'),
            ],
            [
              'Rebalancing Frequency',
              s.rebalanceFrequency,
              s.setRebalanceFrequency,
              cvt('daily:Daily,weekly:Weekly,monthly:Monthly,quarterly:Quarterly,yearly:Annual'),
            ],
            [
              'Return Objective',
              s.returnObjective,
              s.setReturnObjective,
              cvt('maxCagr:backtest.optimizer.maxCagr,minVolatility:Minimize Volatility'),
            ],
            ['Solver', s.solver, s.setSolver, cvt('markowitz:Markowitz,nsga2:NSGA-II')],
          ].map((x) => {
            const [l, v, c, o] = x as [string, string, (v: string) => void, [string, string][]];
            return (
              <SelectField key={l} label={t(l)} value={v} onChange={c} options={toOpts(o, t)} />
            );
          })}
          <FieldShell>
            <FieldLabel>{t('Min Inclusion Weight')}</FieldLabel>
            <PercentInput
              min={0}
              max={100}
              value={s.minInclusionWeight}
              onChange={(e) => s.setMinInclusionWeight(Number(e.target.value))}
            />
          </FieldShell>
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
        onClick={s.run}
        label={t('Calculate Efficient Frontier')}
        loadingLabel={t('Calculating...')}
      />
    </div>
  );
}
function FrontierResults({ state: s }: { state: ReturnType<typeof useEfficientFrontierState> }) {
  const { t } = useTranslation(),
    rb = s.rebalanceFrequency,
    rfLabel = t(`efficientFrontier.rebalanceFreq.${rb}`, { defaultValue: '' }) || rb,
    sel = s.selectedPoint,
    ms = s.maxSharpe,
    ce = s.correlationError;
  const series: any[] = s.scatterData.map((e) => ({
    data: [e],
    color: sColor(e.sharpeRatio, s.sharpeRange.min, s.sharpeRange.max),
    symbolSize: 6,
  }));
  if (ms) series.push({ data: [pc(ms)], color: portColor(0), symbol: 'star', symbolSize: 12 });
  const weightBlock = (weights: Record<string, number>, title: string) => (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([tk, w], i) => (
          <div key={tk} className="flex items-center gap-2">
            <span className="w-[60px] shrink-0 text-label font-medium text-fg">{tk}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
              <div
                className="h-full rounded-sm"
                style={{ width: `${w * 100}%`, backgroundColor: portColor(i) }}
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
  const statsBlock = (pt: EfficientFrontierPoint) => (
    <div className="flex flex-col gap-2">
      {[
        [t('Expected Return'), fmtPct(pt.expectedReturn), C_OK],
        [t('Expected Volatility'), fmtPct(pt.expectedVolatility), 'hsl(var(--warning))'],
        [t('Sharpe Ratio'), pt.sharpeRatio.toFixed(2), 'hsl(var(--brand))'],
      ].map(([label, value, color]) => (
        <MiniStatCard key={label} className="bg-elevated p-2.5" {...{ label, value, color }} />
      ))}
    </div>
  );
  const legend = s.allAssetTickers.map((ticker, i) => (
    <div key={ticker} className="flex items-center gap-1 text-caption">
      <span className="inline-block size-3 rounded" style={{ backgroundColor: portColor(i) }} />
      <span className="text-fg-tertiary">{ticker}</span>
    </div>
  ));
  const metrics = [
    ['Rebalancing Frequency', rfLabel, C_FG2],
    ['Allow Cash Allocation', s.allowCash ? t('Yes') : t('No'), s.allowCash ? C_OK : C_FG3],
    ['Return Objective', s.returnObjective === 'maxCagr' ? t('Max CAGR') : t('Min Vol'), C_FG2],
    ['Solver', t(`efficientFrontier.solver.${s.solver}`, { defaultValue: s.solver }), C_FG2],
  ].map(([label, value, color]) => ({ label: t(label), value, color }));
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Calculation failed')}: `}
      isLoading={s.isLoading}
      hasResults={!!s.results?.frontier.length}
      loadingLabel={t('Calculating...')}
      emptyTitle={t('Set parameters and click "Calculate Efficient Frontier" to view results')}
      onRetry={s.run}
    >
      <div className="flex flex-col gap-3">
        {ce && !s.error && <ErrorBanner message={ce} variant="warning" />}
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-h3 font-semibold text-fg">{t('nav.efficientFrontier')}</h3>
              <Button onClick={() => s.handleLoadInBacktester()} variant="ghost">
                <ArrowRight className="size-4" />
                {t('Load in backtester')}
              </Button>
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
              onClick={({ seriesIndex: i }) => {
                const q = i === undefined ? undefined : ((s.results?.frontier ?? [])[i] ?? ms);
                if (q) s.setSelectedPoint(q);
              }}
            />
          </div>
          {s.allocationData.length > 0 && s.allAssetTickers.length > 0 && (
            <div>
              <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
                {t('Frontier Allocations')}
              </h3>
              <SimpleChart
                type="area"
                data={s.allocationData}
                xDataKey="point"
                height={300}
                xLabel={t('Frontier Point')}
                yTickFormatter={(v: number) => `${v}%`}
                yDomain={[0, 100]}
                tooltipFormatter={(v: number) => `${v}%`}
                showLegend={false}
                series={s.allAssetTickers.map((ticker, i) => ({
                  dataKey: ticker,
                  color: portColor(i),
                  stackId: '1',
                  areaOpacity: 0.8,
                }))}
              />
              <div className="mt-2 flex flex-wrap justify-center gap-4">{legend}</div>
            </div>
          )}
          {s.correlations && s.correlations.tickers.length >= 2 && (
            <div>
              <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Correlation Matrix')}</h3>
              <MatrixHeatmap
                rowLabels={s.correlations.tickers}
                columnLabels={s.correlations.tickers}
                matrix={s.correlations.matrix}
                getBackgroundColor={getCorrelationColor}
                getTextColor={getCorrelationTextColor}
                formatValue={(v) => (v as number).toFixed(2)}
              />
            </div>
          )}
          {sel && (
            <div className="mt-4 rounded-md bg-input-bg p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-label font-semibold text-fg">
                  {t('Selected Portfolio Details')}
                </h3>
                <Button onClick={() => s.handleLoadInBacktester(sel)} variant="ghost" size="sm">
                  <ArrowRight className="size-3.5" />
                  {t('Load')}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {weightBlock(sel.weights, t('Weight Allocation'))}
                {statsBlock(sel)}
              </div>
            </div>
          )}
          {ms && (
            <div>
              <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
                {t('Max Sharpe Portfolio')}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {weightBlock(ms.weights, t('Weight'))}
                <div className="flex flex-col gap-3">{statsBlock(ms)}</div>
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Parameters Summary')}</h3>
            <MetricsGrid metrics={metrics} />
          </div>
        </div>
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
  results: FrontierResults,
});
