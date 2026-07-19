/**
 * @file 月度收益热力图
 * @description 以热力图形式展示逐月收益，颜色深浅表示收益正负与大小。
 *   支持两种数据源：分析页多标的模式（results，含标的选择器）与回测页单组合模式（portfolio）。
 *   getHeatColor 统一从 chartCalculations.ts 引入，避免重复定义。
 */
import { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult, PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { getHeatColor } from './chartCalculations.js';

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

/** 标的月度收益序列（归一化数据形状，兼容分析页 ticker 与回测页 portfolio） */
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
      className="param-input"
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
              className="px-2 py-1 text-[11px] font-medium text-left w-10"
              style={{ color: 'var(--text-muted)' }}
            />
            {MONTH_LABELS.map((m) => (
              <th
                key={m}
                className="px-1 py-1 text-[11px] font-medium text-center min-w-[36px]"
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
                className="px-2 py-0.5 text-[11px] font-medium"
                style={{ color: 'var(--text-body)' }}
              >
                {row.year}
              </td>
              {row.months.map((val, mIdx) => (
                <td
                  key={mIdx}
                  className="px-0.5 py-0.5 text-center cursor-default"
                  style={{ backgroundColor: getHeatColor(val) }}
                  title={`${row.year} ${MONTH_LABELS[mIdx]}: ${val !== null ? val.toFixed(2) : '—'}%`}
                >
                  <span
                    className="text-[10px] inline-block w-[34px] leading-[24px]"
                    style={{
                      color: val !== null && Math.abs(val) > 5 ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {val !== null ? val.toFixed(1) : '—'}
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

/** 月度收益热力图 Props */
interface MonthlyHeatmapProps {
  /** 分析页：传入 results 启用多标的选择器 */
  results?: AssetAnalysisResult;
  /** 回测页：传入单个 portfolio */
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
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No monthly return data available
        </div>
      ) : (
        <HeatmapTable data={heatmapData} />
      )}
    </ChartCard>
  );
}

const MonthlyHeatmap = memo(MonthlyHeatmapImpl);
export default MonthlyHeatmap;
