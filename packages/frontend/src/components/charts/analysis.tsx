import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult, PortfolioResult } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS, getHeatColor } from '@/lib/chart-theme.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';
import { BarChartContent } from './sharedChartContent.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { DrawdownChart } from './DrawdownChart.js';
import { CorrelationMatrixTable } from './tables.js';
import ChartCard from '../ChartCard.js';
export const GrowthChart = memo(function GrowthChart({
  growthData,
  portfolioResults,
}: {
  growthData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('analysis.growthCurve')}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={growthData} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <ChartXAxis />
          <ChartYAxis
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
          />
          <ChartTooltip
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number, name: string) => {
              const numValue = typeof value === 'number' && isFinite(value) ? value : 0;
              return [`$${numValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name];
            }}
            isLargeDataset={growthData.length >= 100}
          />
          <ChartLegend />
          {portfolioResults.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              name={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});
export const OverviewCharts = memo(function OverviewCharts({
  results,
  StatsTable,
}: {
  results: AssetAnalysisResult;
  StatsTable: React.ComponentType<{ tickers: AssetAnalysisResult['tickers'] }>;
}) {
  const { t } = useTranslation();
  const { tickers, portfolioResults, growthData } = useAnalysisData(results, 12, 12);
  return (
    <div className="space-y-6">
      <ChartCard title={t('analysis.statsOverview')}>
        <StatsTable tickers={tickers} />
      </ChartCard>
      <GrowthChart growthData={growthData} portfolioResults={portfolioResults} />
      <DrawdownChart portfolios={portfolioResults} />
      {results.correlations && results.correlations.length >= 2 && (
        <CorrelationMatrixTable tickers={tickers} correlations={results.correlations} />
      )}
    </div>
  );
});
interface TelltaleChartProps {
  portfolios?: PortfolioResult[];
  results?: AssetAnalysisResult;
  embedded?: boolean;
}
interface GrowthPoint {
  date: string;
  value: number;
}
interface NamedGrowth {
  name: string;
  growthCurve: GrowthPoint[];
}
function buildTelltaleData(benchmark: NamedGrowth, comparisons: NamedGrowth[]) {
  const benchMap = new Map<string, number>();
  for (const point of benchmark.growthCurve) {
    benchMap.set(point.date, point.value);
  }
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const item of comparisons) {
    for (const point of item.growthCurve) {
      const benchVal = benchMap.get(point.date);
      if (benchVal == null || benchVal === 0) continue;
      if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
      dateMap.get(point.date)![item.name] = +(point.value / benchVal).toFixed(6);
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}
interface TelltaleDataResult {
  chartData: Array<Record<string, number | string>>;
  labels: string[];
  title: string;
  emptyMessage: string | null;
}
function computeTelltaleData(
  portfolios: PortfolioResult[] | undefined,
  results: AssetAnalysisResult | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): TelltaleDataResult {
  if (results) {
    if (results.tickers.length < 2) {
      return {
        chartData: [],
        labels: [],
        title: t('analysis.telltaleChart'),
        emptyMessage: t('analysis.telltaleNeedTwo'),
      };
    }
    const benchmark = {
      name: results.tickers[0].ticker,
      growthCurve: results.tickers[0].growthCurve,
    };
    const comparisons = results.tickers
      .slice(1)
      .map((tk) => ({ name: tk.ticker, growthCurve: tk.growthCurve }));
    const labels = results.tickers.slice(1).map((tk) => tk.ticker);
    const merged = buildTelltaleData(benchmark, comparisons);
    return {
      chartData:
        merged.length > DOWNSAMPLE_THRESHOLD ? downsample(merged, DOWNSAMPLE_TARGET) : merged,
      labels,
      title: `${t('analysis.telltaleRelative')} ${results.tickers[0].ticker}`,
      emptyMessage: null,
    };
  }
  const pf = portfolios ?? [];
  if (pf.length < 2) {
    return {
      chartData: [],
      labels: [],
      title: t('analysis.telltaleChart'),
      emptyMessage: t('analysis.telltaleNeedTwo'),
    };
  }
  const merged = buildTelltaleData(pf[0], pf.slice(1));
  return {
    chartData:
      merged.length > DOWNSAMPLE_THRESHOLD ? downsample(merged, DOWNSAMPLE_TARGET) : merged,
    labels: pf.slice(1).map((p) => p.name),
    title: t('analysis.telltaleChart'),
    emptyMessage: null,
  };
}
function ChartEmptyMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        color: 'var(--text-muted)',
        fontSize: '13px',
        padding: '40px 0',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
function TelltaleChartView({
  chartData,
  labels,
  embedded,
  t,
}: {
  chartData: Array<Record<string, number | string>>;
  labels: string[];
  embedded: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={labels.map((label) => ({ dataKey: label, legendName: label, strokeWidth: 2 }))}
      height={embedded ? 450 : 400}
      yTickFormatter={(v: number) => v.toFixed(3)}
      yLabel={t('analysis.relativeRatio')}
      tooltipValueFormatter={(value: number, name: string) => {
        const numValue = typeof value === 'number' && isFinite(value) ? value : 0;
        return [numValue.toFixed(3), name];
      }}
      tooltipLabelFormatter={(label: string) => `${t('common.date')}: ${label}`}
      referenceY={1}
      showBrush
      colorOffset={1}
    />
  );
}
export function TelltaleChart({ portfolios, results, embedded = false }: TelltaleChartProps) {
  const { t } = useTranslation();
  const { chartData, labels, title, emptyMessage } = useMemo(
    () => computeTelltaleData(portfolios, results, t),
    [portfolios, results, t],
  );
  if (emptyMessage) {
    return (
      <ChartCard title={title}>
        <ChartEmptyMessage message={emptyMessage} />
      </ChartCard>
    );
  }
  const chart = (
    <TelltaleChartView chartData={chartData} labels={labels} embedded={embedded} t={t} />
  );
  if (embedded) {
    return <ChartCard title={title}>{chart}</ChartCard>;
  }
  return (
    <ChartCard title={title} data={chartData} csvFilename="telltale">
      {chart}
    </ChartCard>
  );
}
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
interface MonthlySeries {
  name: string;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
}
function MonthTickerSelector({
  series,
  selected,
  onChange,
}: {
  series: MonthlySeries[];
  selected: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer"
      style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
      value={selected}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {series.map((s, i) => (
        <option key={s.name} value={i}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
function HeatmapTable({ data }: { data: Array<{ year: number; months: (number | null)[] }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th
              className="px-2 py-1 text-label-tiny font-medium text-left w-10"
              style={{ color: 'var(--text-muted)' }}
            />
            {MONTH_LABELS.map((m) => (
              <th
                key={m}
                className="px-1 py-1 text-label-tiny font-medium text-center min-w-[36px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.year}>
              <td
                className="px-2 py-0.5 text-label-tiny font-medium"
                style={{ color: 'var(--text-body)' }}
              >
                {row.year}
              </td>
              {row.months.map((val, mIdx) => (
                <td
                  key={mIdx}
                  className="px-0.5 py-0.5 text-center cursor-default"
                  style={{ backgroundColor: getHeatColor(val) }}
                  title={`${row.year} ${MONTH_LABELS[mIdx]}: ${val !== null ? val.toFixed(2) : '-'}%`}
                >
                  <span
                    className="text-micro inline-block w-[34px] leading-[24px]"
                    style={{
                      color: val !== null && Math.abs(val) > 5 ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {val !== null ? val.toFixed(1) : '-'}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
interface HeatmapRow {
  year: number;
  months: (number | null)[];
}
function buildHeatmapData(series: MonthlySeries): HeatmapRow[] {
  const yearMap = new Map<number, (number | null)[]>();
  for (const mr of series.monthlyReturns ?? []) {
    if (!yearMap.has(mr.year)) yearMap.set(mr.year, Array(12).fill(null));
    yearMap.get(mr.year)![mr.month - 1] = +(mr.return * 100).toFixed(2);
  }
  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({ year, months }));
}
interface MonthlyHeatmapProps {
  results?: AssetAnalysisResult;
  portfolio?: PortfolioResult;
}
function MonthlyHeatmapImpl({ results, portfolio }: MonthlyHeatmapProps) {
  const { t } = useTranslation();
  const series: MonthlySeries[] = useMemo(() => {
    if (results) {
      return results.tickers.map((tk) => ({
        name: tk.ticker,
        monthlyReturns: tk.monthlyReturns,
      }));
    }
    if (portfolio) {
      return [{ name: portfolio.name, monthlyReturns: portfolio.monthlyReturns }];
    }
    return [];
  }, [results, portfolio]);
  const multiTicker = series.length > 1;
  const [selected, setSelected] = useState(0);
  const currentIdx = multiTicker ? Math.min(selected, series.length - 1) : 0;
  const current = series[currentIdx];
  const heatmapData = useMemo(() => (current ? buildHeatmapData(current) : []), [current]);
  const title = portfolio
    ? t('charts.monthlyHeatmap.titleWithName', { name: portfolio.name })
    : t('analysis.monthlyReturnsHeatmap');
  const exportData = heatmapData.map((row) => {
    const entry: Record<string, string | number> = { year: row.year };
    MONTH_LABELS.forEach((m, i) => {
      const val = row.months[i];
      entry[m] = val !== null ? val : '';
    });
    return entry;
  });
  return (
    <ChartCard
      title={title}
      data={exportData}
      csvFilename={`monthly-return-${current?.name ?? 'data'}`}
      headerExtra={
        multiTicker ? (
          <MonthTickerSelector series={series} selected={currentIdx} onChange={setSelected} />
        ) : undefined
      }
    >
      {heatmapData.length === 0 ? (
        <div className="text-label" style={{ color: 'var(--text-muted)' }}>
          No monthly return data available
        </div>
      ) : (
        <HeatmapTable data={heatmapData} />
      )}
    </ChartCard>
  );
}
export const MonthlyHeatmap = memo(MonthlyHeatmapImpl);
interface SeasonalityChartProps {
  portfolios: PortfolioResult[];
}
export function SeasonalityChart({ portfolios }: SeasonalityChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) {
    return (
      <ChartCard title={t('charts.seasonality.title')}>
        <ChartEmptyMessage message={t('charts.seasonality.noData')} />
      </ChartCard>
    );
  }
  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    t('charts.seasonality.monthLabel', { n: i + 1 }),
  );
  const data = computeSeasonalityData(portfolios, monthLabels);
  return (
    <ChartCard title={t('charts.seasonality.title')} data={data} csvFilename="seasonality">
      <BarChartContent
        data={data}
        seriesNames={portfolios.map((p) => p.name)}
        xDataKey="month"
        height={400}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        yLabel={t('charts.seasonality.avgReturnAxis')}
        barRadius={2}
        signColorSingleSeries
      />
    </ChartCard>
  );
}
function computeSeasonalityData(portfolios: PortfolioResult[], monthLabels: string[]) {
  const monthData: Record<number, Record<string, { sum: number; count: number }>> = {};
  for (let m = 1; m <= 12; m++) {
    monthData[m] = {};
  }
  for (const p of portfolios) {
    for (const point of p.monthlyReturns || []) {
      if (!monthData[point.month][p.name]) {
        monthData[point.month][p.name] = { sum: 0, count: 0 };
      }
      monthData[point.month][p.name].sum += point.return;
      monthData[point.month][p.name].count += 1;
    }
  }
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const row: Record<string, number | string> = { month: monthLabels[i] };
    for (const p of portfolios) {
      const d = monthData[m][p.name];
      if (d && d.count > 0) {
        row[p.name] = +((d.sum / d.count) * 100).toFixed(2);
      }
    }
    return row;
  });
}
