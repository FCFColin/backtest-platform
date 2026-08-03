import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Download, Settings2, Info } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/uiComponents.js';
import { cn } from '@/lib/utils.js';
import { CHART_COLORS, type PortfolioResult, type Statistics } from '@backtest/shared';
import {
  formatCurrency,
  formatPercent,
  formatDuration,
  formatNumber,
  fmtPct,
} from '@/utils/format.js';
import { STAT_KEY_TO_TESTID } from './types.js';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
interface StatColumn {
  key: string;
  label: string;
  format: 'currency' | 'percent' | 'duration' | 'number' | 'text';
  colorize?: boolean;
  sticky?: 'left' | 'right';
  minWidth?: string;
}
const DEFAULT_COLUMNS: StatColumn[] = [
  {
    key: 'name',
    label: 'statsTable.portfolioName',
    format: 'text',
    sticky: 'left',
    minWidth: '140px',
  },
  { key: 'endingValue', label: 'statsTable.endingValue', format: 'currency' },
  { key: 'totalContributions', label: 'statsTable.totalContributions', format: 'currency' },
  {
    key: 'cumulativeReturn',
    label: 'statsTable.cumulativeReturn',
    format: 'percent',
    colorize: true,
  },
  { key: 'cagr', label: 'CAGR', format: 'percent', colorize: true },
  { key: 'mwrr', label: 'MWRR', format: 'percent', colorize: true },
  { key: 'maxDrawdown', label: 'statsTable.maxDrawdown', format: 'percent', colorize: true },
  { key: 'avgDrawdown', label: 'statsTable.avgDrawdown', format: 'percent', colorize: true },
  { key: 'longestDrawdown', label: 'statsTable.longestDrawdown', format: 'duration' },
  { key: 'volatility', label: 'statsTable.volatility', format: 'percent' },
  { key: 'sharpe', label: 'statsTable.sharpe', format: 'number' },
  { key: 'sortino', label: 'statsTable.sortino', format: 'number' },
  { key: 'calmar', label: 'statsTable.calmar', format: 'number' },
  { key: 'ulcerIndex', label: 'Ulcer', format: 'number' },
  { key: 'upi', label: 'UPI', format: 'number' },
  { key: 'diversificationRatio', label: 'statsTable.diversificationRatio', format: 'number' },
  { key: 'beta', label: 'Beta', format: 'number' },
];
interface StatisticsTableProps {
  portfolios: Array<{
    id: string;
    name: string;
    stats: Record<string, number | string>;
  }>;
  colors: string[];
  onExport?: () => void;
  extendedTable?: React.ReactNode;
}
const FORMAT_FN: Record<string, (v: number) => string> = {
  currency: formatCurrency,
  percent: formatPercent,
  duration: formatDuration,
  number: formatNumber,
};
const getColorClass = (value: number): string =>
  value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : 'text-fg';
// eslint-disable-next-line max-lines-per-function
export function StatisticsTable({
  portfolios,
  colors,
  onExport,
  extendedTable,
}: StatisticsTableProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const visibleColumns = DEFAULT_COLUMNS.filter((c) => !hiddenColumns.has(c.key));
  const sortedPortfolios = [...portfolios].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a.stats[sortKey] as number;
    const bv = b.stats[sortKey] as number;
    if (typeof av !== 'number' || typeof bv !== 'number') return 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });
  const renderCell = (portfolio: (typeof portfolios)[0], col: StatColumn, index: number) => {
    if (col.key === 'name') {
      return (
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: colors[index] ?? '#888' }}
          />
          <span className="truncate">{portfolio.name}</span>
        </div>
      );
    }
    const value = portfolio.stats[col.key];
    if (value === undefined || value === null) return '—';
    return FORMAT_FN[col.format]?.(Number(value)) ?? String(value);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h3">{t('statsTable.ui.title')}</h3>
          <span className="text-caption text-fg-tertiary">
            {t('statsTable.ui.portfolioCount', { count: portfolios.length })} ·{' '}
            {t('statsTable.ui.columnCount', { count: visibleColumns.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-caption"
          >
            {expanded ? t('statsTable.ui.collapseExtended') : t('statsTable.ui.expandExtended')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DEFAULT_COLUMNS.filter((c) => c.key !== 'name').map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={!hiddenColumns.has(col.key)}
                  onCheckedChange={(checked) => {
                    const next = new Set(hiddenColumns);
                    if (checked) next.delete(col.key);
                    else next.add(col.key);
                    setHiddenColumns(next);
                  }}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="bg-surface-sunken border-b border-border">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'h-10 px-3 text-fg-tertiary text-label-tiny',
                      col.format === 'text' ? 'text-left' : 'text-right',
                      col.sticky === 'left' && 'sticky left-0 bg-surface-sunken z-10',
                    )}
                    style={{ minWidth: col.minWidth }}
                  >
                    <button
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-fg transition-colors',
                        col.format !== 'text' && 'ml-auto',
                      )}
                      onClick={() => {
                        if (sortKey === col.key) {
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortKey(col.key);
                          setSortDir('desc');
                        }
                      }}
                    >
                      {col.label}
                      {sortKey === col.key &&
                        (sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPortfolios.map((p, i) => (
                <tr
                  key={p.id}
                  className={cn(
                    'h-12 border-b border-border-subtle',
                    'hover:bg-hover/50 transition-colors',
                    i === sortedPortfolios.length - 1 && 'border-b-0',
                  )}
                >
                  {visibleColumns.map((col) => {
                    const value = col.key === 'name' ? p.name : (p.stats[col.key] as number);
                    return (
                      <td
                        key={col.key}
                        data-testid={STAT_KEY_TO_TESTID[col.key]}
                        className={cn(
                          'px-3',
                          col.format === 'text' ? 'text-left' : 'text-right',
                          col.format !== 'text' && 'font-mono tabular-nums',
                          col.sticky === 'left' && 'sticky left-0 bg-surface z-10',
                          col.colorize && typeof value === 'number' && getColorClass(value),
                        )}
                      >
                        {renderCell(p, col, i)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {expanded && extendedTable}
    </div>
  );
}
interface ExtendedMetricsTableProps {
  portfolios: Array<{
    id: string;
    name: string;
    stats: Record<string, number>;
  }>;
}
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
export function ExtendedMetricsTable({ portfolios }: ExtendedMetricsTableProps) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof portfolios)[number]>[] = [
    { key: 'name', label: t('results.extendedMetrics.portfolio'), render: (p) => p.name },
    ...EXTENDED_COLUMNS.map((col) => ({
      key: col.key,
      label: col.label,
      align: 'right' as const,
      render: (p: (typeof portfolios)[number]) => {
        const value = p.stats[col.key] ?? 0;
        return (
          <span
            className={
              col.format === 'percent'
                ? value < 0
                  ? 'text-neg'
                  : value > 0
                    ? 'text-pos'
                    : undefined
                : undefined
            }
          >
            {col.format === 'percent' ? formatPercent(value) : formatNumber(value)}
          </span>
        );
      },
    })),
  ];
  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <SimpleTable columns={columns} data={portfolios} rowKey={(p) => p.id} />
    </div>
  );
}
const HORIZON_LABELS = [
  'stats.horizon10y',
  'stats.horizon20y',
  'stats.horizon30y',
  'stats.horizon40y',
] as const;
const RATE_ROWS = [
  {
    labelKey: 'stats.swr',
    descKey: 'stats.swrDesc',
    keys: ['swr10y', 'swr20y', 'swr30y', 'swr40y'] as const,
  },
  {
    labelKey: 'stats.pwr',
    descKey: 'stats.pwrDesc',
    keys: ['pwr10y', 'pwr20y', 'pwr30y', 'pwr40y'] as const,
  },
] as const;
interface WithdrawalRatesCardProps {
  portfolios: PortfolioResult[];
}
function hasWithdrawalData(portfolios: PortfolioResult[]): boolean {
  return portfolios.some((p) =>
    RATE_ROWS.some((row) =>
      row.keys.some((k) => {
        const v = p.statistics[k];
        return v != null && v !== 0;
      }),
    ),
  );
}
export // eslint-disable-next-line max-lines-per-function -- 提现率卡片多区块渲染，内聚保留
function WithdrawalRatesCard({ portfolios }: WithdrawalRatesCardProps) {
  const { t } = useTranslation();
  if (!hasWithdrawalData(portfolios)) return null;
  const showName = portfolios.length > 1;
  return (
    <Card data-testid="withdrawal-rates-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-h3">
          {t('components.statisticsTable.groups.withdrawalRate')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolios.map((p, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          return (
            <div key={p.name} className="space-y-2">
              {showName && (
                <div className="flex items-center gap-2 text-caption text-fg-secondary">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{p.name}</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="h-9 pr-3 text-left text-label-tiny text-fg-tertiary" />
                      {HORIZON_LABELS.map((label) => (
                        <th
                          key={label}
                          className="h-9 px-2 text-right text-label-tiny text-fg-tertiary"
                        >
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RATE_ROWS.map((row) => (
                      <tr
                        key={row.labelKey}
                        className="border-b border-border-subtle last:border-b-0"
                      >
                        <td className="py-2 pr-3 text-left">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-fg-secondary">{t(row.labelKey)}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info
                                  className="size-3 cursor-help text-fg-tertiary"
                                  aria-label={t(row.descKey)}
                                />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
                                {t(row.descKey)}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </td>
                        {row.keys.map((k) => (
                          <td
                            key={k}
                            data-testid={`withdrawal-rate-${k}`}
                            className="px-2 py-2 text-right font-mono tabular-nums text-fg"
                          >
                            {fmtPct(p.statistics[k as keyof Statistics] as number)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
