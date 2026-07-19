/**
 * @file 年度收益柱状图
 * @description 展示各投资组合按年度的收益对比柱状图。
 *   支持两种数据源：回测页 portfolios（含汇总统计表与明细表）与分析页 results（仅柱状图）。
 */
import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult, AssetAnalysisResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from './chartConstants.js';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';
import { percentile, mean, std } from '@/utils/stats';
import { fmtPct } from '@/utils/format';
import ChartCard from '../ChartCard.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
} from './chartConstants.js';

/** 年度收益柱状图 Props */
interface AnnualReturnChartProps {
  /** 回测页：传入 portfolios 显示柱状图 + 汇总统计表 + 明细表 */
  portfolios?: PortfolioResult[];
  /** 分析页：传入 results 仅显示柱状图 */
  results?: AssetAnalysisResult;
}

const SUMMARY_ROWS: Array<{ labelKey: string; key: string }> = [
  { labelKey: 'charts.annualReturn.min', key: 'min' },
  { labelKey: 'charts.annualReturn.p1', key: 'p1' },
  { labelKey: 'charts.annualReturn.p5', key: 'p5' },
  { labelKey: 'charts.annualReturn.p25', key: 'p25' },
  { labelKey: 'charts.annualReturn.median', key: 'p50' },
  { labelKey: 'charts.annualReturn.p75', key: 'p75' },
  { labelKey: 'charts.annualReturn.p95', key: 'p95' },
  { labelKey: 'charts.annualReturn.p99', key: 'p99' },
  { labelKey: 'charts.annualReturn.max', key: 'max' },
  { labelKey: 'charts.annualReturn.mean', key: 'mean' },
  { labelKey: 'charts.annualReturn.std', key: 'std' },
  { labelKey: 'charts.annualReturn.skewness', key: 'skewness' },
  { labelKey: 'charts.annualReturn.kurtosis', key: 'kurtosis' },
  { labelKey: 'charts.annualReturn.pctPositive', key: 'pctPositive' },
];

/** 单个组合的汇总统计表 */
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
  return (
    <div style={{ marginTop: '16px' }}>
      <div className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: CHART_COLORS[colorIndex % CHART_COLORS.length] }}
        />
        {portfolio.name} Summary Statistics
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ maxWidth: '600px' }}>
          <tbody>
            {SUMMARY_ROWS.map((row, ri) => (
              <tr
                key={row.key}
                style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[12px] py-1.5 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {t(row.labelKey)}
                </td>
                <td
                  className="text-[12px] font-medium text-right py-1.5 px-3 font-mono"
                  style={{
                    color: 'var(--text-strong)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {(stats as Record<string, string>)[row.key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 表头列 */
function AnnualReturnTableHeader({ portfolios }: { portfolios: PortfolioResult[] }) {
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th
        className="text-[12px] font-semibold text-left py-2 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        Year
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="text-[12px] font-semibold text-right py-2 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </th>
      ))}
    </tr>
  );
}

/** 表体行 */
function AnnualReturnTableRow({
  row,
  ri,
  portfolios,
}: {
  row: Record<string, unknown>;
  ri: number;
  portfolios: PortfolioResult[];
}) {
  const year = row.year as number;
  return (
    <tr key={year} style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
      <td
        className="text-[13px] py-1.5 px-3 font-mono"
        style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
      >
        {year}
      </td>
      {portfolios.map((p) => {
        const val = row[p.name] as number | undefined;
        const isNeg = val !== undefined && val < 0;
        return (
          <td
            key={p.name}
            className="text-[13px] font-medium text-right py-1.5 px-3 font-mono"
            style={{
              color: isNeg ? '#c94a4a' : 'var(--text-strong)',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            {val !== undefined ? `${val.toFixed(2)}%` : '—'}
          </td>
        );
      })}
    </tr>
  );
}

/** 年度收益明细表 */
function AnnualReturnTable({
  portfolios,
  data,
}: {
  portfolios: PortfolioResult[];
  data: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: '20px' }}>
      <div className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
        {t('charts.annualReturn.tableTitle')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <AnnualReturnTableHeader portfolios={portfolios} />
          </thead>
          <tbody>
            {data
              .slice()
              .reverse()
              .map((row, ri) => (
                <AnnualReturnTableRow
                  key={row.year as number}
                  row={row}
                  ri={ri}
                  portfolios={portfolios}
                />
              ))}
          </tbody>
        </table>
      </div>
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
    <ChartCard title={t('charts.annualReturn.title')} data={mergedData} csvFilename="annual-return">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={mergedData} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          {seriesNames.map((name, idx) => (
            <Bar
              key={name}
              dataKey={name}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
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
