import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import type { MonteCarloResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import { fmtAmount, fmtPct } from '@/utils/format';
import {
  categoryAxis,
  tooltipOption,
  tooltipRow,
  valueYAxis,
} from '@/components/charts/chartUtils.js';
import EChart from '@/components/charts/EChart.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ResultsShell } from '@/components/resultsShell.js';
import {
  Card,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { SimpleTable } from '@/components/tables.js';
import { McParamsPanel } from './MonteCarloParams.js';
import type { DistMetric, McState, PortfolioMode, ResultTab } from './monteCarloUtils.js';
import {
  METRIC_FORMAT,
  RESULT_TABS,
  SUMMARY_STATS,
  buildDistHistogram,
  buildFanChartData,
  buildPresets,
  buildScenarioData,
  buildSuccessData,
  buildSummaryData,
  buildTerminalHistogram,
  dollarKFormatter,
  metricLabels,
  monthFormatter,
  yearLabelFormatter,
  useMonteCarloState,
} from './monteCarloUtils.js';
import type { FanDataPoint } from './monteCarloUtils.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { axisTooltipFormatter } from '@/components/charts/chartUtils.js';
import { useMediaQuery } from '@/hooks/miscHooks.js';
function NoDataCard() {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <TableEmpty message={t('No data')} className="text-caption" />
    </Card>
  );
}
function HistogramChart({
  data,
  height = 350,
  tooltipFormatter,
  disableTooltipAnimation = false,
  referenceLines,
}: {
  data: { range: string; count: number }[];
  height?: number;
  tooltipFormatter?: (value: number, name: string) => [string, string] | string;
  disableTooltipAnimation?: boolean;
  referenceLines?: { label: string; color: string; value: string }[];
}) {
  const { t } = useTranslation();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  if (data.length === 0) return <NoDataCard />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = [
    {
      type: 'bar',
      name: t('Frequency'),
      data: data.map((d) => ({
        value: d.count,
        itemStyle: { color: getPortfolioColor(0), opacity: 0.7, borderRadius: [2, 2, 0, 0] },
      })),
      barMaxWidth: 60,
    },
  ];
  if (referenceLines?.length) {
    seriesArr[0].markLine = {
      silent: true,
      data: referenceLines.map((rl) => ({
        xAxis: rl.label,
        lineStyle: { color: rl.color, type: 'dashed', width: 1.5 },
        label: { formatter: rl.value, position: 'top', color: rl.color, fontSize: 11 },
      })),
    };
  }
  const option: EChartsOption = {
    grid: { top: 20, right: 20, bottom: 20, left: 60 },
    xAxis: categoryAxis(
      data.map((d) => d.range),
      { interval: 3 },
    ),
    yAxis: valueYAxis(),
    tooltip: tooltipOption(axisTooltipFormatter(undefined, tooltipFormatter)),
    series: seriesArr as EChartsOption['series'],
    animation: !disableTooltipAnimation && !reducedMotion,
  };
  return <EChart option={option} height={height} ariaLabel={t('Frequency Distribution')} />;
}

function MonteCarloDistributionsTab({
  r,
  distMetric,
  setDistMetric,
  startingValue,
}: {
  r: MonteCarloResult;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  startingValue: number;
}) {
  const { t } = useTranslation();
  if (!r.perPathMetrics || r.perPathMetrics.length === 0) return <NoDataCard />;
  const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(
    r.perPathMetrics,
    distMetric,
    startingValue,
  );
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(metricLabels(t)) as DistMetric[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setDistMetric(key)}
            className={cn(
              'rounded-md border px-3 py-1 text-caption font-medium transition-colors duration-150',
              distMetric === key
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border bg-input-bg text-fg-secondary hover:bg-hover hover:text-fg',
            )}
          >
            {metricLabels(t)[key]}
          </button>
        ))}
      </div>
      <HistogramChart
        data={data}
        referenceLines={[
          {
            label: medianLabel,
            color: getPortfolioColor(2),
            value: t('charts.annualReturn.median', {
              value: medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : '',
            }),
          },
          {
            label: meanLabel,
            color: getPortfolioColor(1),
            value: t('charts.annualReturn.mean', {
              value: meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : '',
            }),
          },
        ]}
      />
    </Card>
  );
}
const SCENARIO_LINES = [
  { key: 'best' as const, color: getPortfolioColor(2), width: 2, name: 'Best' },
  { key: 'p75' as const, color: getPortfolioColor(0), width: 1.5, name: 'P75' },
  { key: 'median' as const, color: getPortfolioColor(4), width: 2.5, name: 'Median' },
  { key: 'p25' as const, color: getPortfolioColor(1), width: 1.5, name: 'P25' },
  { key: 'worst' as const, color: getPortfolioColor(3), width: 2, name: 'Worst' },
];
function MonteCarloScenariosTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0) return <NoDataCard />;
  return (
    <Card className="p-5">
      <SimpleChart
        type="line"
        data={data}
        height={450}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        xDataKey="month"
        xType="category"
        xTickFormatter={(v) => monthFormatter(Number(v))}
        xTickInterval={11}
        yTickFormatter={dollarKFormatter}
        legendPosition="top"
        tooltipFormatter={(v) => fmtAmount(v)}
        tooltipLabelFormatter={(label) => yearLabelFormatter(t, Number(label))}
        ariaLabel={t('Scenario Paths')}
        series={SCENARIO_LINES.map((l) => ({
          name: l.name,
          dataKey: l.key,
          color: l.color,
          width: l.width,
          smooth: true,
        }))}
      />
    </Card>
  );
}
function FanChart({ data }: { data: FanDataPoint[] }) {
  const { t } = useTranslation();
  const months = data.map((d) => String(d.month));
  const bands = [
    { dataKey: 'band5_95' as const, opacity: 0.08, name: t('monteCarlo.fanChart.band5_95') },
    { dataKey: 'band25_75' as const, opacity: 0.18, name: t('monteCarlo.fanChart.band25_75') },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态构造堆叠 band 系列
  const seriesArr: any[] = [];
  bands.forEach((band) => {
    seriesArr.push(
      {
        type: 'line',
        stack: band.dataKey,
        data: data.map((d) => d[band.dataKey][0]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
      },
      {
        type: 'line',
        stack: band.dataKey,
        name: band.name,
        data: data.map((d) => d[band.dataKey][1] - d[band.dataKey][0]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: getPortfolioColor(0), opacity: band.opacity },
      },
    );
  });
  seriesArr.push({
    type: 'line',
    name: t('Median'),
    data: data.map((d) => d.p50),
    symbol: 'none',
    lineStyle: { width: 2.5, color: getPortfolioColor(0) },
    itemStyle: { color: getPortfolioColor(0) },
    emphasis: { focus: 'series' },
  });
  const byMonth = new Map(data.map((d) => [d.month, d]));
  const option: EChartsOption = {
    grid: { top: 10, right: 30, left: 60, bottom: 40 },
    xAxis: categoryAxis(months, {
      formatter: (v: string) => monthFormatter(Number(v)),
      interval: (i: number) => data[i].month % 12 === 0,
    }),
    yAxis: valueYAxis({ formatter: dollarKFormatter }),
    tooltip: tooltipOption((p: { axisValue: string; marker: string }) => {
      const d = byMonth.get(Number(p.axisValue));
      if (!d) return '';
      const [lo95, hi95] = d.band5_95;
      const [lo75, hi75] = d.band25_75;
      const color = getPortfolioColor(0);
      return [
        tooltipRow(
          `<span style="background:${color};width:8px;height:8px;display:inline-block;border-radius:2px"></span>`,
          t('Median'),
          dollarKFormatter(d.p50),
        ),
        tooltipRow(
          p.marker,
          t('monteCarlo.fanChart.band25_75'),
          `${dollarKFormatter(lo75)} – ${dollarKFormatter(hi75)}`,
        ),
        tooltipRow(
          p.marker,
          t('monteCarlo.fanChart.band5_95'),
          `${dollarKFormatter(lo95)} – ${dollarKFormatter(hi95)}`,
        ),
      ].join('');
    }),
    series: seriesArr as EChartsOption['series'],
  };
  return <EChart option={option} height={450} ariaLabel={t('Monte Carlo Fan Chart')} />;
}
function MonteCarloTerminalHistogram({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data, p5Val, p50Val, p95Val, p5Label, p50Label, p95Label } = buildTerminalHistogram(
    r,
    startingValue,
  );
  if (data.length === 0) return null;
  return (
    <Card className="p-5">
      <h4 className="mb-3 text-sm font-semibold text-fg-secondary tabular-nums">
        {t('Terminal Value Distribution')}
      </h4>
      <HistogramChart
        data={data}
        height={300}
        disableTooltipAnimation
        tooltipFormatter={(value: number) => [String(value), t('Frequency')]}
        referenceLines={[
          {
            label: p5Label,
            color: getPortfolioColor(3),
            value: t('charts.annualReturn.p5', { value: fmtAmount(p5Val) }),
          },
          {
            label: p50Label,
            color: getPortfolioColor(2),
            value: t('charts.annualReturn.median', { value: fmtAmount(p50Val) }),
          },
          {
            label: p95Label,
            color: getPortfolioColor(4),
            value: t('charts.annualReturn.p95', { value: fmtAmount(p95Val) }),
          },
        ]}
      />
    </Card>
  );
}
function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  if (data.length === 0) return <NoDataCard />;
  const lines = [
    {
      key: 'survival' as const,
      color: getPortfolioColor(2),
      nameKey: 'monteCarlo.results.survivalProb',
    },
    {
      key: 'capitalPreservation' as const,
      color: getPortfolioColor(0),
      nameKey: 'Capital Preservation',
    },
    {
      key: 'profit' as const,
      color: getPortfolioColor(1),
      nameKey: 'monteCarlo.results.profitProb',
    },
  ];
  return (
    <Card className="p-5">
      <SimpleChart
        type="line"
        data={data}
        height={400}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        xType="category"
        xLabel={t('Years')}
        yTickFormatter={(v) => `${v}%`}
        yDomain={[0, 100]}
        legendPosition="top"
        tooltipFormatter={(v) => `${v}%`}
        ariaLabel={t('Success Probability')}
        series={lines.map((l) => ({
          name: t(l.nameKey),
          dataKey: l.key,
          color: l.color,
          width: 2,
          smooth: true,
        }))}
      />
    </Card>
  );
}
function MonteCarloRangeTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { t } = useTranslation();
  const data = buildFanChartData(r, startingValue);
  if (data.length === 0) return <NoDataCard />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold tabular-nums text-fg-secondary">
          {t('Monte Carlo Fan Chart')}
        </h4>
        <FanChart data={data} />
      </Card>
      <MonteCarloTerminalHistogram r={r} startingValue={startingValue} />
    </div>
  );
}
function MonteCarloSummaryTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const rows = buildSummaryData(r, startingValue, t);
  if (!rows) return <NoDataCard />;
  const columns = [
    { key: 'metric', label: t('Metric'), render: (row: (typeof rows)[number]) => row.metric },
    ...SUMMARY_STATS.map((s) => ({
      key: s,
      label: s,
      align: 'right' as const,
      render: (row: (typeof rows)[number]) => row.values[s],
    })),
  ];
  return (
    <Card className="p-5">
      <SimpleTable columns={columns} data={rows} rowKey={(row) => row.key} />
    </Card>
  );
}
function ResultsDisplay({
  r,
  label,
  colorIdx,
  portfolioMode,
  activeTab,
  startingValue,
  numSimulations,
  distMetric,
  setDistMetric,
  onTabChange,
}: {
  r: MonteCarloResult;
  label: string;
  colorIdx: number;
  portfolioMode: PortfolioMode;
  activeTab: ResultTab;
  startingValue: number;
  numSimulations: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  onTabChange: (tab: ResultTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <div key={label}>
      {portfolioMode === 2 && (
        <div
          className="mb-3 mt-2 text-h3 font-semibold"
          style={{ color: getPortfolioColor(colorIdx) }}
        >
          {label}
        </div>
      )}
      <div className="mb-5">
        <MetricsGrid
          metrics={[
            {
              label: t('Median Final Value'),
              value: fmtAmount(r.statistics.medianFinalValue * startingValue),
            },
            {
              label: t('Mean Final Value'),
              value: fmtAmount(r.statistics.meanFinalValue * startingValue),
            },
            {
              label: t('Capital Preservation'),
              value: fmtPct(r.statistics.successRate, 1),
              color: 'hsl(var(--success))',
            },
            {
              label: t('Simulation Count'),
              value: `${r.perPathMetrics?.length ?? numSimulations}`,
            },
          ]}
        />
      </div>
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ResultTab)} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          {RESULT_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {t(tab.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-[300px]">
          <TabsContent value="summary">
            <MonteCarloSummaryTab r={r} startingValue={startingValue} />
          </TabsContent>
          <TabsContent value="range">
            <MonteCarloRangeTab r={r} startingValue={startingValue} />
          </TabsContent>
          <TabsContent value="success">
            <MonteCarloSuccessTab r={r} />
          </TabsContent>
          <TabsContent value="distributions">
            <MonteCarloDistributionsTab
              r={r}
              distMetric={distMetric}
              setDistMetric={setDistMetric}
              startingValue={startingValue}
            />
          </TabsContent>
          <TabsContent value="scenarios">
            <MonteCarloScenariosTab r={r} startingValue={startingValue} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
function MonteCarloResultsPanel({ s }: { s: McState }) {
  const {
    error,
    isLoading,
    results1,
    results2,
    portfolios,
    portfolioMode,
    activeTab,
    setActiveTab,
    startingValue,
    numSimulations,
    distMetric,
    setDistMetric,
  } = s;
  const { t } = useTranslation();
  const dp = (r: MonteCarloResult, idx: number) => ({
    r,
    label: portfolios[idx].name,
    colorIdx: idx,
    portfolioMode,
    activeTab,
    startingValue,
    numSimulations,
    distMetric,
    setDistMetric,
    onTabChange: setActiveTab,
  });
  return (
    <ResultsShell
      error={error}
      isLoading={isLoading}
      hasResults={Boolean(results1 || results2)}
      errorPrefix={`${t('Simulation failed')}: `}
      loadingLabel={t('Running simulations...')}
      emptyTitle={t('Configure parameters above and click "Start Simulation" to see results')}
      onRetry={s.runSimulation}
    >
      <div className="flex flex-col gap-6">
        {results1 && <ResultsDisplay {...dp(results1, 0)} />}
        {results2 && (
          <>
            <Separator />
            <ResultsDisplay {...dp(results2, 1)} />
          </>
        )}
      </div>
    </ResultsShell>
  );
}
const config: ComputeToolConfig<McState> = {
  titleKey: 'nav.monteCarlo',
  seoDescKey: 'monteCarlo.seoDesc',
  seoFeatures: [
    { titleKey: 'monteCarlo.seoSimulatable', descKey: 'monteCarlo.seoSimulatableDesc' },
    { titleKey: 'monteCarlo.seoOutput', descKey: 'monteCarlo.seoOutputDesc' },
  ],
  relatedTools: [
    TOOL_LINKS.backtest,
    TOOL_LINKS.optimizer,
    TOOL_LINKS.efficientF,
    TOOL_LINKS.analysis,
  ],
  presets: buildPresets,
  params: ({ state }: { state: McState }) => <McParamsPanel s={state} />,
  results: ({ state }: { state: McState }) => <MonteCarloResultsPanel s={state} />,
};
export default function MonteCarloPage() {
  const s = useMonteCarloState();
  return <ComputeToolShell config={config} state={s} />;
}
