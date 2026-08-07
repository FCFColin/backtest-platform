import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'recharts';
import { CHART_COLORS, type AssetAnalysisResult, type PortfolioResult } from '@backtest/shared';
import { getHeatColor } from '@/lib/chart-theme.js';
import { BarChartContent, SimpleLineChart } from './sharedChartContent.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { downsample, DOWNSAMPLE_THRESHOLD, DOWNSAMPLE_TARGET } from '../../utils/format.js';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { DrawdownChart } from './drawdownCharts.js';
import { CorrelationMatrixTable } from './tables.js';
import ChartCard from '../ChartCard.js';
const GrowthChart = memo(function GrowthChart({
  growthData,
  portfolioResults,
}: {
  growthData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Growth Curve')}>
      <SimpleLineChart
        data={growthData}
        height={350}
        yTickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
        tooltipLabelFormatter={(label: string) => `${t('Date')}: ${label}`}
        tooltipFormatter={(value: number, name: string) => {
          const numValue = typeof value === 'number' && isFinite(value) ? value : 0;
          return [`$${numValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name];
        }}
      >
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
      </SimpleLineChart>
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
  const { tickers, portfolioResults, growthData } = useAnalysisData(results, 12);
  return (
    <div className="space-y-6">
      <ChartCard title={t('Statistics Overview')}>
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
}
type NamedCurve = { name: string; growthCurve: Array<{ date: string; value: number }> };
function buildDateMap(benchMap: Map<string, number>, comparisons: NamedCurve[]) {
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const { name, growthCurve } of comparisons)
    for (const { date, value } of growthCurve) {
      const benchVal = benchMap.get(date);
      if (!benchVal) continue;
      const ratio = +(value / benchVal).toFixed(6);
      const row = dateMap.get(date);
      if (row) row[name] = ratio;
      else dateMap.set(date, { date, [name]: ratio });
    }
  return dateMap;
}
function computeTelltaleData(
  portfolios: PortfolioResult[] | undefined,
  results: AssetAnalysisResult | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const isResults = !!results;
  const source = isResults ? results!.tickers : (portfolios ?? []);
  const toNamed = (s: (typeof source)[0]) => ({
    name: 'ticker' in s ? s.ticker : s.name,
    growthCurve: s.growthCurve,
  });
  const benchmark = source[0] ? toNamed(source[0]) : undefined;
  const comparisons = source.slice(1).map(toNamed);
  const labels = comparisons.map((c) => c.name);
  const title = isResults
    ? `${t('Telltale Chart — Relative')} ${results!.tickers[0].ticker}`
    : t('Telltale Chart');
  if (!benchmark || comparisons.length < 1)
    return {
      chartData: [],
      labels,
      title,
      emptyMessage: t('At least 2 assets required to display telltale chart'),
    };
  const benchMap = new Map<string, number>();
  for (const { date, value } of benchmark.growthCurve) benchMap.set(date, value);
  const dateMap = buildDateMap(benchMap, comparisons);
  const merged = [...dateMap.values()].sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
  return {
    chartData:
      merged.length > DOWNSAMPLE_THRESHOLD ? downsample(merged, DOWNSAMPLE_TARGET) : merged,
    labels,
    title,
    emptyMessage: null,
  };
}
function ChartEmptyMessage({ message }: { message: string }) {
  return <div className="py-10 text-center text-[13px] text-[var(--text-muted)]">{message}</div>;
}
function TelltaleChartView({
  chartData,
  labels,
  t,
}: {
  chartData: Array<Record<string, number | string>>;
  labels: string[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={labels.map((label) => ({ dataKey: label, legendName: label, strokeWidth: 2 }))}
      height={400}
      yTickFormatter={(v: number) => v.toFixed(3)}
      yLabel={t('Relative Ratio')}
      tooltipValueFormatter={(value: number, name: string) => {
        const numValue = typeof value === 'number' && isFinite(value) ? value : 0;
        return [numValue.toFixed(3), name];
      }}
      tooltipLabelFormatter={(label: string) => `${t('Date')}: ${label}`}
      referenceY={1}
      showBrush
      colorOffset={1}
    />
  );
}
export function TelltaleChart({ portfolios, results }: TelltaleChartProps) {
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
  return (
    <ChartCard title={title} data={chartData} csvFilename="telltale">
      <TelltaleChartView chartData={chartData} labels={labels} t={t} />
    </ChartCard>
  );
}
const MONTH_LABELS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
interface MonthlySeries {
  name: string;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
}
function HeatmapTable({ data }: { data: Array<{ year: number; months: (number | null)[] }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-label-tiny font-medium text-left w-10 text-fg-tertiary" />
            {MONTH_LABELS.map((m) => (
              <th
                key={m}
                className="px-1 py-1 text-label-tiny font-medium text-center min-w-[36px] text-fg-tertiary"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.year}>
              <td className="px-2 py-0.5 text-label-tiny font-medium text-fg-secondary">
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
    ? t('{{name}} Monthly Returns Heatmap', { name: portfolio.name })
    : t('Monthly Returns Heatmap');
  const exportData = heatmapData.map((row) => ({
    year: row.year,
    ...Object.fromEntries(MONTH_LABELS.map((m, i) => [m, row.months[i] ?? ''])),
  }));
  return (
    <ChartCard
      title={title}
      data={exportData}
      csvFilename={`monthly-return-${current?.name ?? 'data'}`}
      headerExtra={
        multiTicker ? (
          <select
            className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer w-[100px] text-xs py-1 px-2"
            value={currentIdx}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {series.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {heatmapData.length === 0 ? (
        <div className="text-label text-fg-tertiary">No monthly return data available</div>
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
      <ChartCard title={t('Seasonality')}>
        <ChartEmptyMessage message={t('No data')} />
      </ChartCard>
    );
  }
  const monthLabels = Array.from({ length: 12 }, (_, i) => t('Month {{n}}', { n: i + 1 }));
  const data = computeSeasonalityData(portfolios, monthLabels);
  return (
    <ChartCard title={t('Seasonality')} data={data} csvFilename="seasonality">
      <BarChartContent
        data={data}
        seriesNames={portfolios.map((p) => p.name)}
        xDataKey="month"
        height={400}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        yLabel={t('Average Return')}
        barRadius={2}
        signColorSingleSeries
      />
    </ChartCard>
  );
}
function computeSeasonalityData(portfolios: PortfolioResult[], monthLabels: string[]) {
  const monthData: Record<number, Record<string, { sum: number; count: number }>> = {};
  for (let m = 1; m <= 12; m++) monthData[m] = {};
  for (const p of portfolios) {
    for (const point of p.monthlyReturns || []) {
      const d = (monthData[point.month][p.name] ??= { sum: 0, count: 0 });
      d.sum += point.return;
      d.count++;
    }
  }
  return monthLabels.map((label, i) => {
    const row: Record<string, number | string> = { month: label };
    for (const p of portfolios) {
      const d = monthData[i + 1][p.name];
      if (d?.count) row[p.name] = +((d.sum / d.count) * 100).toFixed(2);
    }
    return row;
  });
}
