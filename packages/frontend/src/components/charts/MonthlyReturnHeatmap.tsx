/**
 * @file 月度收益热力图
 * @description 以热力图形式展示投资组合逐月收益，颜色深浅表示收益正负与大小
 */
import { useMemo } from 'react';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';

/** 月度收益热力图 Props */
interface MonthlyReturnHeatmapProps {
  portfolio: PortfolioResult;
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

export default function MonthlyReturnHeatmap({ portfolio }: MonthlyReturnHeatmapProps) {
  const data = useMemo(() => buildHeatmapData(portfolio), [portfolio]);

  if (data.length === 0) {
    return (
      <ChartCard title="月度收益" data={[]}>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No monthly return data available
        </div>
      </ChartCard>
    );
  }

  const exportData = data.map((row) => {
    const entry: Record<string, string | number> = { year: row.year };
    MONTH_LABELS.forEach((m, i) => {
      const val = row.months[i];
      entry[m] = val !== null ? val : '';
    });
    return entry;
  });

  return (
    <ChartCard
      title={`月度收益 — ${portfolio.name}`}
      data={exportData}
      csvFilename={`monthly-return-${portfolio.name}`}
    >
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
                    style={{
                      backgroundColor: getHeatColor(val),
                    }}
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
    </ChartCard>
  );
}

interface HeatmapRow {
  year: number;
  months: (number | null)[];
}

function buildHeatmapData(portfolio: PortfolioResult): HeatmapRow[] {
  const yearMap = new Map<number, (number | null)[]>();
  for (const mr of portfolio.monthlyReturns ?? []) {
    if (!yearMap.has(mr.year)) {
      yearMap.set(mr.year, Array(12).fill(null));
    }
    yearMap.get(mr.year)![mr.month - 1] = mr.return;
  }
  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({ year, months }));
}

// 浅色热力图配色
function getHeatColor(val: number | null): string {
  if (val === null) return 'var(--bg-subtle)';
  if (val > 5) return '#1a7a3a';
  if (val > 2) return '#2e8b57';
  if (val > 0) return '#8bc9a3';
  if (val > -1) return '#f5d5d5';
  if (val > -2) return '#e8a0a0';
  if (val > -5) return '#d47070';
  return '#c94a4a';
}
