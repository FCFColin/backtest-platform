/* eslint-disable react-refresh/only-export-components -- 统计表导出多个组件与辅助，保持目录 barrel 结构 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/uiComponents.js';
import type { StatRow, StatGroup, MetricImportance, FmtType } from './types.js';
import { fmtPct, fmtRatio, fmtNum } from '@/utils/format';
import { STAT_KEY_TO_TESTID } from './types.js';
export function formatValue(v: number | undefined, fmt: FmtType): string {
  if (v == null) return '—';
  if (fmt === 'pct') return fmtPct(v);
  if (fmt === 'ratio') return fmtRatio(v);
  if (fmt === 'num') return fmtNum(v, 2);
  if (fmt === 'int') return `${Math.round(v)}d`;
  if (fmt === 'duration') return `${Math.round(v)}d`;
  return v.toString();
}
export interface StatisticsTableHeaderProps {
  portfolios: PortfolioResult[];
  minWidth?: string;
}
export function StatisticsTableHeader({
  portfolios,
  minWidth = '320px',
}: StatisticsTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <tr className="stat-table-header-row">
      <th
        className="stat-table-header-cell stat-table-metric-cell text-caption text-left"
        style={{ minWidth }}
      >
        {t('common.metric')}
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="stat-table-header-cell stat-table-value-cell text-caption text-right"
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
export interface MetricsRowsProps {
  rows: StatRow[];
  portfolios: PortfolioResult[];
}
function getValueColorClass(val: number | undefined, higherIsBetter?: boolean): string {
  if (val == null) return '';
  const positiveIsGood = higherIsBetter !== false;
  if (val > 0) return positiveIsGood ? 'stat-value-positive' : 'stat-value-negative';
  if (val < 0) return positiveIsGood ? 'stat-value-negative' : 'stat-value-positive';
  return '';
}
function getRowClassName(importance?: MetricImportance): string {
  const baseClass = 'stat-table-data-row';
  if (!importance) return baseClass;
  return `${baseClass} stat-row-${importance}`;
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
        const rowClass = getRowClassName(row.importance);
        return (
          <tr key={row.key} className={rowClass}>
            <td className="stat-table-metric-cell">
              <MetricLabel row={row} />
            </td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key] as number | undefined;
              const colorClass = getValueColorClass(val, row.higherIsBetter);
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
export interface HierarchicalMetricsRowsProps {
  rows: StatRow[];
  portfolios: PortfolioResult[];
  expanded: boolean;
}
export function HierarchicalMetricsRows({
  rows,
  portfolios,
  expanded,
}: HierarchicalMetricsRowsProps) {
  const primaryRows = rows.filter((r) => r.importance === 'primary');
  const secondaryRows = rows.filter((r) => r.importance === 'secondary');
  const detailedRows = rows.filter((r) => r.importance === 'detailed');
  const renderRow = (row: StatRow) => {
    const hasAnyValue = portfolios.some((p) => p.statistics[row.key] != null);
    if (!hasAnyValue) return null;
    const rowClass = getRowClassName(row.importance);
    return (
      <tr key={row.key} className={rowClass}>
        <td className="stat-table-metric-cell">
          <MetricLabel row={row} />
        </td>
        {portfolios.map((p) => {
          const val = p.statistics[row.key] as number | undefined;
          const colorClass = getValueColorClass(val, row.higherIsBetter);
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
  };
  return (
    <>
      {primaryRows.map(renderRow)}
      {secondaryRows.map(renderRow)}
      {expanded && detailedRows.map(renderRow)}
    </>
  );
}
export interface StatisticsGroupRowsProps {
  group: StatGroup;
  portfolios: PortfolioResult[];
  colCount: number;
}
export function StatisticsGroupRows({ group, portfolios, colCount }: StatisticsGroupRowsProps) {
  const { t } = useTranslation();
  return (
    <Fragment key={group.title}>
      <tr className="stat-table-group-row">
        <td colSpan={colCount} className="stat-table-group-cell text-caption">
          {t(group.title)}
        </td>
      </tr>
      <MetricsRows rows={group.rows} portfolios={portfolios} />
    </Fragment>
  );
}
export interface MetricsToggleProps {
  expanded: boolean;
  onToggle: () => void;
  colCount: number;
}
export function MetricsToggle({ expanded, onToggle, colCount }: MetricsToggleProps) {
  const { t } = useTranslation();
  return (
    <tr className="stat-toggle-row">
      <td colSpan={colCount}>
        <button type="button" className="stat-toggle-button" onClick={onToggle}>
          <span
            className="stat-toggle-arrow"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            ▼
          </span>
          {expanded ? t('results.hideDetailedMetrics') : t('results.showDetailedMetrics')}
        </button>
      </td>
    </tr>
  );
}
