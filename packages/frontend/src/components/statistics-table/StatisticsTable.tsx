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
  const cellContent = (p: (typeof portfolios)[0], col: StatColumn, i: number) =>
    col.key === 'name' ? (
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: colors[i] ?? '#888' }}
        />
        <span className="truncate">{p.name}</span>
      </div>
    ) : p.stats[col.key] == null ? (
      '—'
    ) : (
      (FORMAT_FN[col.format]?.(Number(p.stats[col.key])) ?? String(p.stats[col.key]))
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h3">{t('Statistics Overview')}</h3>
          <span className="text-caption text-fg-tertiary">
            {t('{{count}} portfolios', { count: portfolios.length })} ·{' '}
            {t('{{count}} columns', { count: visibleColumns.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-caption"
          >
            {expanded ? t('Collapse extended metrics') : t('Expand extended metrics (+30)')}
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
                        {cellContent(p, col, i)}
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
const EXTENDED_COLUMNS: StatColumn[] = [
  { key: 'var95', label: 'VaR 95%', format: 'percent' },
  { key: 'var99', label: 'VaR 99%', format: 'percent' },
  { key: 'cvar95', label: 'CVaR 95%', format: 'percent' },
  { key: 'cvar99', label: 'CVaR 99%', format: 'percent' },
  { key: 'sortinoBear', label: 'Sortino Bear', format: 'number' },
  { key: 'sortinoBull', label: 'Sortino Bull', format: 'number' },
  { key: 'sharpeBear', label: 'Sharpe Bear', format: 'number' },
  { key: 'sharpeBull', label: 'Sharpe Bull', format: 'number' },
  { key: 'skewness', label: 'Skewness', format: 'number' },
  { key: 'kurtosis', label: 'Kurtosis', format: 'number' },
  { key: 'kelly', label: 'Kelly', format: 'percent' },
  { key: 'alpha', label: 'Alpha', format: 'percent' },
  { key: 'r2', label: 'R²', format: 'number' },
  { key: 'trackingError', label: 'Tracking Error', format: 'percent' },
  { key: 'infoRatio', label: 'Info Ratio', format: 'number' },
  { key: 'bestYear', label: 'Best Year', format: 'percent' },
  { key: 'worstYear', label: 'Worst Year', format: 'percent' },
  { key: 'bestMonth', label: 'Best Month', format: 'percent' },
  { key: 'worstMonth', label: 'Worst Month', format: 'percent' },
  { key: 'upCapture', label: 'Up Capture', format: 'percent' },
  { key: 'downCapture', label: 'Down Capture', format: 'percent' },
  { key: 'positiveMonthsPct', label: 'Positive Months %', format: 'percent' },
  { key: 'negativeMonthsPct', label: 'Negative Months %', format: 'percent' },
];
export function ExtendedMetricsTable({ portfolios }: ExtendedMetricsTableProps) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof portfolios)[number]>[] = [
    { key: 'name', label: t('Portfolio'), render: (p) => p.name },
    ...EXTENDED_COLUMNS.map((col) => ({
      key: col.key,
      label: col.label,
      align: 'right' as const,
      render: (p: (typeof portfolios)[number]) => {
        const value = p.stats[col.key] ?? 0;
        const cls =
          col.format === 'percent'
            ? value < 0
              ? 'text-neg'
              : value > 0
                ? 'text-pos'
                : undefined
            : undefined;
        return (
          <span className={cls}>
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
    RATE_ROWS.some((row) => row.keys.some((k) => p.statistics[k] != null && p.statistics[k] !== 0)),
  );
}
export function WithdrawalRatesCard({ portfolios }: WithdrawalRatesCardProps) {
  const { t } = useTranslation();
  if (!hasWithdrawalData(portfolios)) return null;
  const showName = portfolios.length > 1;
  const columns: SimpleTableColumn<{
    labelKey: string;
    descKey: string;
    keys: readonly (keyof Statistics)[];
    portfolio: PortfolioResult;
  }>[] = [
    {
      key: 'label',
      label: '',
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <span className="text-fg-secondary">{t(row.labelKey)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 cursor-help text-fg-tertiary" aria-label={t(row.descKey)} />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
              {t(row.descKey)}
            </TooltipContent>
          </Tooltip>
        </span>
      ),
    },
    ...HORIZON_LABELS.map((label, i) => ({
      key: `h${i}`,
      label: t(label),
      align: 'right' as const,
      render: (row: {
        labelKey: string;
        descKey: string;
        keys: readonly (keyof Statistics)[];
        portfolio: PortfolioResult;
      }) => fmtPct(row.portfolio.statistics[row.keys[i]] as number),
    })),
  ];
  return (
    <Card data-testid="withdrawal-rates-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-h3">{t('Withdrawal Rates')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolios.map((p, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          const data = RATE_ROWS.map((row) => ({ ...row, portfolio: p }));
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
              <SimpleTable columns={columns} data={data} rowKey={(r) => r.labelKey} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
