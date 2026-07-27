/**
 * @file ExtendedMetricsTable 组件
 * @description 30+ 高级指标横向表格：VaR/CVaR/Sortino Bear&Bull/Sharpe Bear&Bull/
 *   Skewness/Kurtosis/Kelly/Alpha/R²/TrackingError/InfoRatio/
 *   Best/Worst Year&Month/Up&Down Capture/Positive&Negative Months%。
 */
import { cn } from '@/lib/utils.js';
import { formatPercent, formatNumber } from '@/lib/formatters.js';

interface ExtendedMetricsTableProps {
  portfolios: Array<{
    id: string;
    name: string;
    stats: Record<string, number>;
  }>;
}

/** 高级指标列定义 */
const EXTENDED_COLUMNS = [
  { key: 'var95', label: 'VaR 95%', format: 'percent' as const },
  { key: 'var99', label: 'VaR 99%', format: 'percent' as const },
  { key: 'cvar95', label: 'CVaR 95%', format: 'percent' as const },
  { key: 'cvar99', label: 'CVaR 99%', format: 'percent' as const },
  { key: 'sortinoBear', label: 'Sortino Bear', format: 'number' as const },
  { key: 'sortinoBull', label: 'Sortino Bull', format: 'number' as const },
  { key: 'sharpeBear', label: 'Sharpe Bear', format: 'number' as const },
  { key: 'sharpeBull', label: 'Sharpe Bull', format: 'number' as const },
  { key: 'skewness', label: 'Skewness', format: 'number' as const },
  { key: 'kurtosis', label: 'Kurtosis', format: 'number' as const },
  { key: 'kelly', label: 'Kelly', format: 'percent' as const },
  { key: 'alpha', label: 'Alpha', format: 'percent' as const },
  { key: 'r2', label: 'R²', format: 'number' as const },
  { key: 'trackingError', label: 'Tracking Error', format: 'percent' as const },
  { key: 'infoRatio', label: 'Info Ratio', format: 'number' as const },
  { key: 'bestYear', label: 'Best Year', format: 'percent' as const },
  { key: 'worstYear', label: 'Worst Year', format: 'percent' as const },
  { key: 'bestMonth', label: 'Best Month', format: 'percent' as const },
  { key: 'worstMonth', label: 'Worst Month', format: 'percent' as const },
  { key: 'upCapture', label: 'Up Capture', format: 'percent' as const },
  { key: 'downCapture', label: 'Down Capture', format: 'percent' as const },
  { key: 'positiveMonthsPct', label: 'Positive Months %', format: 'percent' as const },
  { key: 'negativeMonthsPct', label: 'Negative Months %', format: 'percent' as const },
];

/**
 * 高级指标表格组件。
 * @param props - portfolios（含 stats 的组合列表）。
 * @returns 高级指标横向表格元素。
 */
export function ExtendedMetricsTable({ portfolios }: ExtendedMetricsTableProps) {
  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="bg-surface-sunken border-b border-border">
              <th className="h-10 px-3 text-left text-label-tiny text-fg-tertiary sticky left-0 bg-surface-sunken z-10">
                组合
              </th>
              {EXTENDED_COLUMNS.map((col) => (
                <th key={col.key} className="h-10 px-3 text-right text-label-tiny text-fg-tertiary">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {portfolios.map((p) => (
              <tr key={p.id} className="h-12 border-b border-border-subtle last:border-b-0 hover:bg-hover/50">
                <td className="px-3 text-left sticky left-0 bg-surface z-10">{p.name}</td>
                {EXTENDED_COLUMNS.map((col) => {
                  const value = p.stats[col.key] ?? 0;
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 text-right font-mono tabular-nums',
                        col.format === 'percent' && value < 0 && 'text-neg',
                        col.format === 'percent' && value > 0 && 'text-pos',
                      )}
                    >
                      {col.format === 'percent' ? formatPercent(value) : formatNumber(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
