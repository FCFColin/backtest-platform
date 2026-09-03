import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AssetAnalysisResult, type PortfolioResult } from '@backtest/shared';
import { MiniSelect } from '@/components/ui/uiComponents';
import { getHeatColor } from '@/lib/chart-theme.js';
import { BarChartContent } from './sharedChartContent.js';
import { ChartEmptyState } from '@/components/stateDisplay.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { maybeDownsample } from '../../utils/format.js';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { DrawdownChart } from './drawdownCharts.js';
import { CorrelationMatrixTable } from './tables.js';
import ChartCard from '../ChartCard.js';
import { GrowthChart } from './GrowthChart.js';
type TFn = ReturnType<typeof useTranslation>['t'];
export const OverviewCharts = memo(function OverviewCharts({
  results,
  StatsTable,
}: {
  results: AssetAnalysisResult;
  StatsTable: React.ComponentType<{ tickers: AssetAnalysisResult['tickers'] }>;
}) {
  const { t } = useTranslation(),
    { tickers, portfolioResults } = useAnalysisData(results);
  return (
    <div className="space-y-6">
      <ChartCard title={t('Statistics Overview')}>
        <StatsTable tickers={tickers} />
      </ChartCard>
      <GrowthChart portfolios={portfolioResults} />
      <DrawdownChart portfolios={portfolioResults} />
      {results.correlations && results.correlations.length >= 2 && (
        <CorrelationMatrixTable tickers={tickers} correlations={results.correlations} />
      )}
    </div>
  );
});
function buildDateMap(
  bench: Map<string, number>,
  comps: { name: string; growthCurve: { date: string; value: number }[] }[],
) {
  const dm = new Map<string, Record<string, number | string>>();
  for (const { name, growthCurve } of comps)
    for (const { date, value } of growthCurve) {
      const bv = bench.get(date);
      if (!bv) continue;
      const r = dm.get(date);
      if (r) r[name] = +(value / bv).toFixed(6);
      else dm.set(date, { date, [name]: +(value / bv).toFixed(6) });
    }
  return dm;
}
function computeTelltaleData(
  portfolios: PortfolioResult[] | undefined,
  results: AssetAnalysisResult | undefined,
  t: TFn,
) {
  const isResults = !!results,
    src = isResults ? results!.tickers : (portfolios ?? []),
    toNamed = (s: (typeof src)[0]) => ({
      name: 'ticker' in s ? s.ticker : s.name,
      growthCurve: s.growthCurve,
    }),
    bench = src[0] ? toNamed(src[0]) : undefined,
    comps = src.slice(1).map(toNamed),
    labels = comps.map((c) => c.name),
    title = isResults
      ? `${t('Telltale Chart — Relative')} ${results!.tickers[0].ticker}`
      : t('Telltale Chart');
  if (!bench || comps.length < 1)
    return {
      chartData: [],
      labels,
      title,
      emptyMessage: t('At least 2 assets required to display telltale chart'),
    };
  const bm = new Map<string, number>();
  for (const { date, value } of bench.growthCurve) bm.set(date, value);
  const merged = [...buildDateMap(bm, comps).values()].sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
  return { chartData: maybeDownsample(merged), labels, title, emptyMessage: null };
}
function TelltaleChartView({
  chartData,
  labels,
}: {
  chartData: Record<string, number | string>[];
  labels: string[];
}) {
  const { t } = useTranslation();
  return (
    <TimeSeriesLineChart
      data={chartData}
      series={labels.map((label) => ({ dataKey: label, legendName: label, strokeWidth: 2 }))}
      height={400}
      yTickFormatter={(v: number) => v.toFixed(3)}
      yLabel={t('Relative Ratio')}
      tooltipValueFormatter={(value: number, name: string) => {
        const n = typeof value === 'number' && isFinite(value) ? value : 0;
        return [n.toFixed(3), name];
      }}
      tooltipLabelFormatter={(label: string) => `${t('Date')}: ${label}`}
      referenceY={1}
      showBrush
      colorOffset={1}
    />
  );
}
export function TelltaleChart({
  portfolios,
  results,
}: {
  portfolios?: PortfolioResult[];
  results?: AssetAnalysisResult;
}) {
  const { t } = useTranslation(),
    { chartData, labels, title, emptyMessage } = useMemo(
      () => computeTelltaleData(portfolios, results, t),
      [portfolios, results, t],
    );
  if (emptyMessage)
    return (
      <ChartCard title={title}>
        <ChartEmptyState message={emptyMessage} />
      </ChartCard>
    );
  return (
    <ChartCard title={title} data={chartData} csvFilename="telltale">
      <TelltaleChartView chartData={chartData} labels={labels} />
    </ChartCard>
  );
}
const MONTH_LABELS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
function HeatmapTable({ data }: { data: { year: number; months: (number | null)[] }[] }) {
  const { t } = useTranslation(),
    mn = (n: number) => t('Month {{n}}', { n });
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-label-tiny font-medium text-left w-10 text-fg-tertiary" />
            {Array.from({ length: 12 }, (_, i) => (
              <th
                key={i + 1}
                className="px-1 py-1 text-label-tiny font-medium text-center min-w-[36px] text-fg-tertiary"
              >
                {mn(i + 1)}
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
              {row.months.map((val, mi) => (
                <td
                  key={mi}
                  className="px-0.5 py-0.5 text-center cursor-default"
                  style={{ backgroundColor: getHeatColor(val) }}
                  title={`${row.year} ${mn(mi + 1)}: ${val !== null ? val.toFixed(2) : '-'}%`}
                >
                  <span
                    className="text-micro inline-block w-[34px] leading-[24px]"
                    style={{
                      color:
                        val !== null && Math.abs(val) > 2
                          ? 'hsl(var(--corr-text-strong))'
                          : 'hsl(var(--fg))',
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
function buildHeatmapData(s: {
  monthlyReturns?: { year: number; month: number; return: number }[];
}) {
  const ym = new Map<number, (number | null)[]>();
  for (const mr of s.monthlyReturns ?? []) {
    if (!ym.has(mr.year)) ym.set(mr.year, Array(12).fill(null));
    ym.get(mr.year)![mr.month - 1] = +(mr.return * 100).toFixed(2);
  }
  return Array.from(ym.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({ year, months }));
}
export const MonthlyHeatmap = memo(function MonthlyHeatmap({
  results,
  portfolio,
}: {
  results?: AssetAnalysisResult;
  portfolio?: PortfolioResult;
}) {
  const { t } = useTranslation(),
    series: { name: string; monthlyReturns: { year: number; month: number; return: number }[] }[] =
      useMemo(() => {
        if (results)
          return results.tickers.map((tk) => ({
            name: tk.ticker,
            monthlyReturns: tk.monthlyReturns,
          }));
        if (portfolio) return [{ name: portfolio.name, monthlyReturns: portfolio.monthlyReturns }];
        return [];
      }, [results, portfolio]),
    multi = series.length > 1,
    [sel, setSel] = useState(0),
    idx = multi ? Math.min(sel, series.length - 1) : 0,
    cur = series[idx],
    hm = useMemo(() => (cur ? buildHeatmapData(cur) : []), [cur]),
    title = portfolio
      ? t('{{name}} Monthly Returns Heatmap', { name: portfolio.name })
      : t('Monthly Returns Heatmap'),
    exportData = hm.map((r) => ({
      year: r.year,
      ...Object.fromEntries(MONTH_LABELS.map((m, i) => [m, r.months[i] ?? ''])),
    }));
  return (
    <ChartCard
      title={title}
      data={exportData}
      csvFilename={`monthly-return-${cur?.name ?? 'data'}`}
      headerExtra={
        multi ? (
          <MiniSelect
            aria-label={t('Portfolio')}
            value={idx}
            onChange={setSel}
            options={series.map((s, i) => ({ value: i, label: s.name }))}
            width={100}
          />
        ) : undefined
      }
    >
      {hm.length === 0 ? (
        <ChartEmptyState message={t('No monthly return data available')} />
      ) : (
        <HeatmapTable data={hm} />
      )}
    </ChartCard>
  );
});
export function SeasonalityChart({ portfolios }: { portfolios: PortfolioResult[] }) {
  const { t } = useTranslation();
  if (portfolios.length === 0)
    return (
      <ChartCard title={t('Seasonality')}>
        <ChartEmptyState message={t('No data')} />
      </ChartCard>
    );
  const ml = Array.from({ length: 12 }, (_, i) => t('Month {{n}}', { n: i + 1 })),
    data = computeSeasonalityData(portfolios, ml);
  return (
    <ChartCard title={t('Seasonality')} data={data} csvFilename="seasonality">
      <BarChartContent
        data={data}
        seriesNames={portfolios.map((p) => p.name)}
        xDataKey="month"
        height={400}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => `${v.toFixed(2)}%`}
        yLabel={t('Average Return')}
        barRadius={2}
        signColorSingleSeries
      />
    </ChartCard>
  );
}
function computeSeasonalityData(portfolios: PortfolioResult[], monthLabels: string[]) {
  const md: Record<number, Record<string, { sum: number; count: number }>> = {};
  for (let m = 1; m <= 12; m++) md[m] = {};
  for (const p of portfolios)
    for (const pt of p.monthlyReturns || []) {
      const d = (md[pt.month][p.name] ??= { sum: 0, count: 0 });
      d.sum += pt.return;
      d.count++;
    }
  return monthLabels.map((label, i) => {
    const row: Record<string, number | string> = { month: label };
    for (const p of portfolios) {
      const d = md[i + 1][p.name];
      if (d?.count) row[p.name] = +((d.sum / d.count) * 100).toFixed(2);
    }
    return row;
  });
}
