import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/uiComponents.js';
import type { StatRow, FmtType } from './types.js';
import { fmtPct, fmtRatio, fmtNum } from '@/utils/format';
import { STAT_KEY_TO_TESTID } from './types.js';
function formatValue(v: number | undefined, fmt: FmtType): string {
  if (v == null) return '—';
  if (fmt === 'pct') return fmtPct(v);
  if (fmt === 'ratio') return fmtRatio(v);
  if (fmt === 'num') return fmtNum(v, 2);
  if (fmt === 'int' || fmt === 'duration') return `${Math.round(v)}d`;
  return v.toString();
}
interface StatisticsTableHeaderProps {
  portfolios: PortfolioResult[];
  minWidth?: string;
}
export function StatisticsTableHeader({
  portfolios,
  minWidth = '320px',
}: StatisticsTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <tr>
      <th className="stat-table-metric-cell text-caption text-left" style={{ minWidth }}>
        {t('Metric')}
      </th>
      {portfolios.map((p, idx) => (
        <th key={p.name} className="stat-table-value-cell text-caption text-right">
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
interface MetricsRowsProps {
  rows: StatRow[];
  portfolios: PortfolioResult[];
}
function MetricLabel({ row }: { row: StatRow }) {
  const { t } = useTranslation();
  if (!row.description) {
    return <>{t(row.label)}</>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span>{t(row.label)}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-3 cursor-help text-fg-tertiary" aria-label={t(row.description)} />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
          {t(row.description)}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
export function MetricsRows({ rows, portfolios }: MetricsRowsProps) {
  return (
    <>
      {rows.map((row) => {
        const hasAnyValue = portfolios.some((p) => p.statistics[row.key] != null);
        if (!hasAnyValue) return null;
        return (
          <tr key={row.key} className="stat-table-data-row">
            <td className="stat-table-metric-cell">
              <MetricLabel row={row} />
            </td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key] as number | undefined;
              const colorClass = val == null ? '' : getColorClass(val);
              return (
                <td
                  key={p.name}
                  data-testid={STAT_KEY_TO_TESTID[row.key as string]}
                  className={`stat-table-value-cell stat-table-num ${colorClass}`}
                >
                  {formatValue(val, row.fmt)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
