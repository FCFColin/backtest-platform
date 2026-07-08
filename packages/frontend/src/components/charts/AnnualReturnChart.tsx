/**
 * @file 年度收益柱状图
 * @description 展示各投资组合按年度的收益对比柱状图
 */
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
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers.js';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';
import ChartCard from '../ChartCard.js';

/** 年度收益柱状图 Props */
interface AnnualReturnChartProps {
  portfolios: PortfolioResult[];
}

const SUMMARY_ROWS: Array<{ label: string; key: string }> = [
  { label: '最小值', key: 'min' },
  { label: '1%分位', key: 'p1' },
  { label: '5%分位', key: 'p5' },
  { label: '25%分位', key: 'p25' },
  { label: '中位数', key: 'p50' },
  { label: '75%分位', key: 'p75' },
  { label: '95%分位', key: 'p95' },
  { label: '99%分位', key: 'p99' },
  { label: '最大值', key: 'max' },
  { label: '均值', key: 'mean' },
  { label: '标准差', key: 'std' },
  { label: '偏度', key: 'skewness' },
  { label: '超额峰度', key: 'kurtosis' },
  { label: '正收益年占比', key: 'pctPositive' },
];

/** 单个组合的汇总统计表 */
function PortfolioSummaryStats({
  portfolio,
  colorIndex,
}: {
  portfolio: PortfolioResult;
  colorIndex: number;
}) {
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
                key={row.label}
                style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[12px] py-1.5 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {row.label}
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
  return (
    <div style={{ marginTop: '20px' }}>
      <div className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
        年度收益表
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

export default function AnnualReturnChart({ portfolios }: AnnualReturnChartProps) {
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.annualReturns,
    (pt) => pt.year,
    (pt) => +(pt.return * 100).toFixed(2),
    'year',
  );

  return (
    <ChartCard title="年度收益" data={mergedData} csvFilename="annual-return">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolios.map((p, idx) => (
            <Bar
              key={p.name}
              dataKey={p.name}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {portfolios.map((p, idx) => (
        <PortfolioSummaryStats key={p.name} portfolio={p} colorIndex={idx} />
      ))}
      <AnnualReturnTable portfolios={portfolios} data={mergedData} />
    </ChartCard>
  );
}

function calcAnnualSummaryStats(p: PortfolioResult) {
  const returns = (p.annualReturns ?? []).map((r) => r.return);
  if (returns.length < 2) return null;

  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));

  const percentile = (p: number) => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  const skewness = (() => {
    if (std === 0) return 0;
    const m3 = sorted.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
    return ((m3 / std ** 3) * Math.sqrt(n * (n - 1))) / (n - 2);
  })();

  const kurtosis = (() => {
    if (std === 0) return 0;
    const m4 = sorted.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
    return m4 / std ** 4 - 3;
  })();

  const pctPositive = sorted.filter((r) => r > 0).length / n;
  const fmt = (v: number) => `${(v * 100).toFixed(2)}%`;

  return {
    min: fmt(sorted[0]),
    p1: fmt(percentile(0.01)),
    p5: fmt(percentile(0.05)),
    p25: fmt(percentile(0.25)),
    p50: fmt(percentile(0.5)),
    p75: fmt(percentile(0.75)),
    p95: fmt(percentile(0.95)),
    p99: fmt(percentile(0.99)),
    max: fmt(sorted[n - 1]),
    mean: fmt(mean),
    std: fmt(std),
    skewness: skewness.toFixed(3),
    kurtosis: kurtosis.toFixed(3),
    pctPositive: fmt(pctPositive),
  };
}
