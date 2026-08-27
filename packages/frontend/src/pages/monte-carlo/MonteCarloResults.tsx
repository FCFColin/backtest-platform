/* eslint-disable @typescript-eslint/no-explicit-any -- ECharts 动态 series 需 any */
import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import type { MonteCarloResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import { fmtAmount, fmtPct } from '@/utils/format';
import * as cu from '@/components/charts/chartUtils.js';
import EChart from '@/components/charts/EChart.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { Card, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS as TL } from '../../components/shells/constants.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { SimpleTable } from '@/components/tables.js';
import { McParamsPanel } from './MonteCarloParams.js';
import * as mcu from './monteCarloUtils.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { useMediaQuery } from '@/hooks/miscHooks.js';
type BaseProps = { r: MonteCarloResult; sv: number };
type DistProps = BaseProps & { dm: mcu.DistMetric; setDm: (v: mcu.DistMetric) => void };
const H4 = 'mb-3 text-sm font-semibold tabular-nums text-fg-secondary';
const BTN = 'rounded-md border px-3 py-1 text-caption font-medium transition-colors duration-150';
const BTN_ON = 'border-brand bg-brand text-brand-fg';
const BTN_OFF = 'border-border bg-input-bg text-fg-secondary hover:bg-hover hover:text-fg';

function NoDataCard() { const { t } = useTranslation(); return <Card className="p-5"><TableEmpty message={t('No data')} className="text-caption" /></Card>; }

function HistogramChart({ data, height = 350, tooltipFormatter: tf, disableTooltipAnimation: noAnim, referenceLines: rl }: { data: { range: string; count: number }[]; height?: number; tooltipFormatter?: (v: number, n: string) => [string, string] | string; disableTooltipAnimation?: boolean; referenceLines?: { label: string; color: string; value: string }[] }) {
  const { t } = useTranslation(), rm = useMediaQuery('(prefers-reduced-motion: reduce)');
  if (!data.length) return <NoDataCard />;
  const s: any[] = [{ type: 'bar', name: t('Frequency'), data: data.map((d) => ({ value: d.count, itemStyle: { color: getPortfolioColor(0), opacity: 0.7, borderRadius: [2, 2, 0, 0] } })), barMaxWidth: 60 }];
  if (rl?.length) s[0].markLine = { silent: true, data: rl.map(({ label: l, color, value }) => ({ xAxis: l, lineStyle: { color, type: 'dashed', width: 1.5 }, label: { formatter: value, position: 'top', color, fontSize: 11 } })) };
  return <EChart option={{ grid: { top: 20, right: 20, bottom: 20, left: 60 }, xAxis: cu.categoryAxis(data.map((d) => d.range), { interval: 3 }), yAxis: cu.valueYAxis(), tooltip: cu.tooltipOption(cu.axisTooltipFormatter(undefined, tf)), series: s as EChartsOption['series'], animation: !noAnim && !rm }} height={height} ariaLabel={t('Frequency Distribution')} />;
}

function McDistTab({ r, dm, setDm, sv }: DistProps) {
  const { t } = useTranslation();
  if (!r.perPathMetrics?.length) return <NoDataCard />;
  const h = mcu.buildDistHistogram(r.perPathMetrics, dm, sv);
  const rl = [{ k: 'charts.annualReturn.median', lb: h.medianLabel, ci: 2, v: h.medianVal }, { k: 'charts.annualReturn.mean', lb: h.meanLabel, ci: 1, v: h.meanVal }].map(({ k, lb, ci, v }) => ({ label: lb, color: getPortfolioColor(ci), value: t(k, { value: v !== undefined ? mcu.METRIC_FORMAT[dm](v) : '' }) }));
  const labels = mcu.metricLabels(t) as Record<mcu.DistMetric, string>;
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-1.5">{(Object.keys(labels) as mcu.DistMetric[]).map((k) => <button key={k} type="button" onClick={() => setDm(k)} className={cn(BTN, dm === k ? BTN_ON : BTN_OFF)}>{labels[k]}</button>)}</div>
      <HistogramChart data={h.data} referenceLines={rl} />
    </Card>
  );
}

const SC_LINES = [
  { dataKey: 'best', color: getPortfolioColor(2), width: 2, name: 'Best', smooth: true },
  { dataKey: 'p75', color: getPortfolioColor(0), width: 1.5, name: 'P75', smooth: true },
  { dataKey: 'median', color: getPortfolioColor(4), width: 2.5, name: 'Median', smooth: true },
  { dataKey: 'p25', color: getPortfolioColor(1), width: 1.5, name: 'P25', smooth: true },
  { dataKey: 'worst', color: getPortfolioColor(3), width: 2, name: 'Worst', smooth: true },
];
function McScenTab({ r, sv }: BaseProps) {
  const { t } = useTranslation(), { data } = mcu.buildScenarioData(r, sv);
  if (!data.length) return <NoDataCard />;
  return <Card className="p-5"><SimpleChart type="line" data={data} height={450} margin={{ top: 10, right: 30, left: 10, bottom: 20 }} xDataKey="month" xType="category" xTickFormatter={(v) => mcu.monthFormatter(Number(v))} xTickInterval={11} yTickFormatter={mcu.dollarKFormatter} legendPosition="top" tooltipFormatter={(v) => fmtAmount(v as number)} tooltipLabelFormatter={(l) => mcu.yearLabelFormatter(t, Number(l))} ariaLabel={t('Scenario Paths')} series={SC_LINES} /></Card>;
}

function FanChart({ data, t }: { data: mcu.FanDataPoint[]; t: (key: string) => string }) {
  const ms = data.map((d) => String(d.month)), mm = new Map(data.map((d) => [d.month, d])), c = getPortfolioColor(0);
  const bandPair = (nm: string, rng: (d: mcu.FanDataPoint) => [number, number], op: number, lb: string) => [
    { type: 'line', stack: nm, data: data.map((d) => rng(d)[0]), symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 } },
    { type: 'line', stack: nm, name: lb, data: data.map((d) => rng(d)[1] - rng(d)[0]), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: c, opacity: op } },
  ];
  const s: any[] = [...bandPair('band5_95', (d) => d.band5_95, 0.08, t('monteCarlo.fanChart.band5_95')), ...bandPair('band25_75', (d) => d.band25_75, 0.18, t('monteCarlo.fanChart.band25_75')),
    { type: 'line', name: t('Median'), data: data.map((d) => d.p50), symbol: 'none', lineStyle: { width: 2.5, color: c }, itemStyle: { color: c }, emphasis: { focus: 'series' } }];
  return <EChart option={{ grid: { top: 10, right: 30, left: 60, bottom: 40 }, xAxis: cu.categoryAxis(ms, { formatter: (v: string) => mcu.monthFormatter(Number(v)), interval: (i: number) => data[i].month % 12 === 0 }), yAxis: cu.valueYAxis({ formatter: mcu.dollarKFormatter }), tooltip: cu.tooltipOption((p: { axisValue: string; marker: string }) => { const d = mm.get(Number(p.axisValue)); if (!d) return ''; const f = mcu.dollarKFormatter; const { p50, band25_75: b25, band5_95: b95 } = d; const dot = `<span style="background:${c};width:8px;height:8px;display:inline-block;border-radius:2px"></span>`; return [cu.tooltipRow(dot, t('Median'), f(p50)), cu.tooltipRow(p.marker, t('monteCarlo.fanChart.band25_75'), `${f(b25[0])} – ${f(b25[1])}`), cu.tooltipRow(p.marker, t('monteCarlo.fanChart.band5_95'), `${f(b95[0])} – ${f(b95[1])}`)].join(''); }), series: s as EChartsOption['series'] }} height={450} ariaLabel={t('Monte Carlo Fan Chart')} />;
}

function McTermHist({ r, sv }: BaseProps) {
  const { t } = useTranslation(), h = mcu.buildTerminalHistogram(r, sv);
  if (!h.data.length) return null;
  const rl = [{ k: 'charts.annualReturn.p5', lb: h.p5Label, ci: 3, v: h.p5Val }, { k: 'charts.annualReturn.median', lb: h.p50Label, ci: 2, v: h.p50Val }, { k: 'charts.annualReturn.p95', lb: h.p95Label, ci: 4, v: h.p95Val }].map(({ k, lb, ci, v }) => ({ label: lb, color: getPortfolioColor(ci), value: t(k, { value: fmtAmount(v) }) }));
  return <Card className="p-5"><h4 className={H4}>{t('Terminal Value Distribution')}</h4><HistogramChart data={h.data} height={300} disableTooltipAnimation tooltipFormatter={(v: number) => [String(v), t('Frequency')]} referenceLines={rl} /></Card>;
}

function McSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation(), data = mcu.buildSuccessData(r);
  if (!data.length) return <NoDataCard />;
  return <Card className="p-5"><SimpleChart type="line" data={data} height={400} margin={{ top: 10, right: 30, left: 10, bottom: 20 }} xType="category" xLabel={t('Years')} yTickFormatter={(v) => `${v}%`} yDomain={[0, 100]} legendPosition="top" tooltipFormatter={(v) => `${v}%`} ariaLabel={t('Success Probability')} series={[{ dataKey: 'survival', color: getPortfolioColor(2), name: t('monteCarlo.results.survivalProb'), width: 2, smooth: true }, { dataKey: 'capitalPreservation', color: getPortfolioColor(0), name: t('Capital Preservation'), width: 2, smooth: true }, { dataKey: 'profit', color: getPortfolioColor(1), name: t('monteCarlo.results.profitProb'), width: 2, smooth: true }]} /></Card>;
}

function McRangeTab({ r, sv }: BaseProps) {
  const { t } = useTranslation(), data = mcu.buildFanChartData(r, sv);
  if (!data.length) return <NoDataCard />;
  return <div className="flex flex-col gap-4"><Card className="p-5"><h4 className={H4}>{t('Monte Carlo Fan Chart')}</h4><FanChart data={data} t={t} /></Card><McTermHist r={r} sv={sv} /></div>;
}

function McSummaryTab({ r, sv }: BaseProps) {
  const { t } = useTranslation(), rows = mcu.buildSummaryData(r, sv, t);
  if (!rows) return <NoDataCard />;
  return <Card className="p-5"><SimpleTable columns={[{ key: 'metric', label: t('Metric'), render: (row: (typeof rows)[number]) => row.metric }, ...mcu.SUMMARY_STATS.map((s) => ({ key: s, label: s, align: 'right' as const, render: (row: (typeof rows)[number]) => row.values[s] }))]} data={rows} rowKey={(row) => row.key} /></Card>;
}

function ResultsDisplay({ s, r, idx }: { s: mcu.McState; r: MonteCarloResult; idx: number }) {
  const { t } = useTranslation();
  const { activeTab: at, startingValue: sv, distMetric: dm, setDistMetric: setDm } = s, st = r.statistics;
  const tabs: [mcu.ResultTab, React.ReactNode][] = [['summary', <McSummaryTab r={r} sv={sv} />], ['range', <McRangeTab r={r} sv={sv} />], ['success', <McSuccessTab r={r} />], ['distributions', <McDistTab r={r} dm={dm} setDm={setDm} sv={sv} />], ['scenarios', <McScenTab r={r} sv={sv} />]];
  return (
    <div key={s.portfolios[idx].name}>
      {s.portfolioMode === 2 && <div className="mb-3 mt-2 text-h3 font-semibold" style={{ color: getPortfolioColor(idx) }}>{s.portfolios[idx].name}</div>}
      <div className="mb-5"><MetricsGrid metrics={[{ label: t('Median Final Value'), value: fmtAmount(st.medianFinalValue * sv) }, { label: t('Mean Final Value'), value: fmtAmount(st.meanFinalValue * sv) }, { label: t('Capital Preservation'), value: fmtPct(st.successRate, 1), color: 'hsl(var(--success))' }, { label: t('Simulation Count'), value: `${r.perPathMetrics?.length ?? s.numSimulations}` }]} /></div>
      <Tabs value={at} onValueChange={(v) => s.setActiveTab(v as mcu.ResultTab)} className="w-full">
        <TabsList className="mb-4 flex-wrap">{mcu.RESULT_TABS.map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{t(tab.label)}</TabsTrigger>)}</TabsList>
        <div className="min-h-[300px]">{tabs.map(([k, n]) => <TabsContent key={k} value={k}>{n}</TabsContent>)}</div>
      </Tabs>
    </div>
  );
}

function ResultsPanel({ s }: { s: mcu.McState }) {
  const { t } = useTranslation();
  return <ResultsShell error={s.error} isLoading={s.isLoading} hasResults={Boolean(s.results1 || s.results2)} errorPrefix={`${t('Simulation failed')}: `} loadingLabel={t('Running simulations...')} emptyTitle={t('Configure parameters above and click "Start Simulation" to see results')} onRetry={s.runSimulation}>
    <div className="flex flex-col gap-6">
      {s.results1 && <ResultsDisplay s={s} r={s.results1} idx={0} />}
      {s.results2 && <Separator />}
      {s.results2 && <ResultsDisplay s={s} r={s.results2} idx={1} />}
    </div>
  </ResultsShell>;
}
const config: ComputeToolConfig<mcu.McState> = {
  titleKey: 'nav.monteCarlo',
  seoDescKey: 'monteCarlo.seoDesc',
  seoFeatures: [{ titleKey: 'monteCarlo.seoSimulatable', descKey: 'monteCarlo.seoSimulatableDesc' }, { titleKey: 'monteCarlo.seoOutput', descKey: 'monteCarlo.seoOutputDesc' }],
  relatedTools: [TL.backtest, TL.optimizer, TL.efficientF, TL.analysis],
  presets: mcu.buildPresets,
  params: ({ state }: { state: mcu.McState }) => <McParamsPanel s={state} />,
  results: ({ state}: { state: mcu.McState }) => <ResultsPanel s={state} />,
};
export default function MonteCarloPage() {
  const s = mcu.useMonteCarloState();
  return <ComputeToolShell config={config} state={s} />;
}
