import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type AssetAnalysisResult, type PortfolioResult } from '@backtest/shared';
import { percentile, mean, std, mergePortfolioSeries, fmtPct } from '@/utils/format';
import ChartCard from '../ChartCard.js';
import { BarChartContent } from './sharedChartContent.js';
import { SimpleTable, type SimpleTableColumn } from '../tables.js';
interface AnnualReturnChartProps {
  portfolios?: PortfolioResult[];
  results?: AssetAnalysisResult;
}
const SUMMARY_ROWS: Array<{ labelKey: string; key: string }> = [
  { labelKey: 'charts.annualReturn.min', key: 'min' },
  { labelKey: 'charts.annualReturn.p1', key: 'p1' },
  { labelKey: 'charts.annualReturn.p5', key: 'p5' },
  { labelKey: 'charts.annualReturn.p25', key: 'p25' },
  { labelKey: 'Median', key: 'p50' },
  { labelKey: 'charts.annualReturn.p75', key: 'p75' },
  { labelKey: 'charts.annualReturn.p95', key: 'p95' },
  { labelKey: 'charts.annualReturn.p99', key: 'p99' },
  { labelKey: 'charts.annualReturn.max', key: 'max' },
  { labelKey: 'charts.annualReturn.mean', key: 'mean' },
  { labelKey: 'backtest.stdev', key: 'std' },
  { labelKey: 'statsTable.skewness', key: 'skewness' },
  { labelKey: 'statsTable.kurtosis', key: 'kurtosis' },
  { labelKey: 'charts.annualReturn.pctPositive', key: 'pctPositive' },
];
function PortfolioSummaryStats({
  portfolio,
  colorIndex,
}: {
  portfolio: PortfolioResult;
  colorIndex: number;
}) {
  const { t } = useTranslation();
  const stats = calcAnnualSummaryStats(portfolio);
  if (!stats) return null;
  const summary = stats as Record<string, string>;
  const columns: SimpleTableColumn<(typeof SUMMARY_ROWS)[number]>[] = [
    { key: 'label', label: '', render: (r) => t(r.labelKey) },
    { key: 'value', label: '', align: 'right', render: (r) => summary[r.key] },
  ];
  return (
    <div style={{ marginTop: '16px' }}>
      <div className="text-label font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: CHART_COLORS[colorIndex % CHART_COLORS.length] }}
        />
        {portfolio.name} Summary Statistics
      </div>
      <SimpleTable columns={columns} data={SUMMARY_ROWS} maxWidth={600} rowKey={(r) => r.key} />
    </div>
  );
}
function AnnualReturnTable({
  portfolios,
  data,
}: {
  portfolios: PortfolioResult[];
  data: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<Record<string, unknown>>[] = [
    { key: 'year', label: 'Year', render: (r) => r.year as number },
    ...portfolios.map((p, idx) => ({
      key: p.name,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </span>
      ),
      align: 'right' as const,
      render: (r: Record<string, unknown>) => {
        const v = r[p.name] as number | undefined;
        return v !== undefined ? (
          <span className={v < 0 ? 'text-neg' : undefined}>{v.toFixed(2)}%</span>
        ) : (
          '-'
        );
      },
    })),
  ];
  return (
    <div style={{ marginTop: '20px' }}>
      <div className="text-label font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
        {t('Annual Returns Table')}
      </div>
      <SimpleTable columns={columns} data={[...data].reverse()} rowKey={(r) => String(r.year)} />
    </div>
  );
}
export default function AnnualReturnChart({ portfolios, results }: AnnualReturnChartProps) {
  const { t } = useTranslation();
  const seriesNames = useMemo<string[]>(() => {
    if (portfolios) return portfolios.map((p) => p.name);
    if (results) return results.tickers.map((tk) => tk.ticker);
    return [];
  }, [portfolios, results]);
  const mergedData = useMemo(() => {
    if (portfolios) {
      return mergePortfolioSeries(
        portfolios,
        (p) => p.annualReturns,
        (pt) => pt.year,
        (pt) => +(pt.return * 100).toFixed(2),
        'year',
      );
    }
    if (results) {
      return mergePortfolioSeries(
        results.tickers.map((tk) => ({ name: tk.ticker, annualReturns: tk.annualReturns })),
        (p) => p.annualReturns,
        (pt) => pt.year,
        (pt) => +(pt.return * 100).toFixed(2),
        'year',
      );
    }
    return [];
  }, [portfolios, results]);
  return (
    <ChartCard title={t('Annual Returns')} data={mergedData} csvFilename="annual-return">
      <BarChartContent
        data={mergedData}
        seriesNames={seriesNames}
        xDataKey="year"
        yTickFormatter={(v: number) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(value: number) => [`${value.toFixed(2)}%`, '']}
        barRadius={2}
      />
      {portfolios?.map((p, idx) => (
        <PortfolioSummaryStats key={p.name} portfolio={p} colorIndex={idx} />
      ))}
      {portfolios && <AnnualReturnTable portfolios={portfolios} data={mergedData} />}
    </ChartCard>
  );
}
function calcAnnualSummaryStats(p: PortfolioResult) {
  const returns = (p.annualReturns ?? []).map((r) => r.return);
  if (returns.length < 2) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  const m = mean(sorted);
  const s = std(sorted);
  const pct = (p: number) => fmtPct(percentile(sorted, p));
  const skewness = (() => {
    if (s === 0) return 0;
    const m3 = sorted.reduce((sum, v) => sum + (v - m) ** 3, 0) / n;
    return ((m3 / s ** 3) * Math.sqrt(n * (n - 1))) / (n - 2);
  })();
  const kurtosis = (() => {
    if (s === 0) return 0;
    const m4 = sorted.reduce((sum, v) => sum + (v - m) ** 4, 0) / n;
    return m4 / s ** 4 - 3;
  })();
  const pctPositive = sorted.filter((r) => r > 0).length / n;
  return {
    min: pct(0),
    p1: pct(0.01),
    p5: pct(0.05),
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p95: pct(0.95),
    p99: pct(0.99),
    max: pct(1),
    mean: fmtPct(m),
    std: fmtPct(s),
    skewness: skewness.toFixed(3),
    kurtosis: kurtosis.toFixed(3),
    pctPositive: fmtPct(pctPositive),
  };
}
