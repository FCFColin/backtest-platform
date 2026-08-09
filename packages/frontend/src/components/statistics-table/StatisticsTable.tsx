import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Info } from 'lucide-react';
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
import { CHART_COLORS, type PortfolioResult, type Statistics } from '@backtest/shared';
import { formatCurrency, fmtPct, formatDuration, fmtNum } from '@/utils/format.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { STAT_KEY_TO_TESTID } from './types.js';
import { DEFAULT_COLUMNS, EXTENDED_COLUMNS, type StatColumn } from './columns.js';
import {
  SortableTable,
  SimpleTable,
  TableFrame,
  type SimpleTableColumn,
} from '@/components/tables.js';
interface PortfolioStatsRow {
  id: string;
  name: string;
  stats: Record<string, number | string>;
}
interface StatisticsTableProps {
  portfolios: PortfolioStatsRow[];
  colors: string[];
  extendedTable?: React.ReactNode;
  currency?: string;
}
const FORMAT_FN: Record<string, (v: number) => string> = {
  percent: fmtPct,
  duration: formatDuration,
  number: fmtNum,
};
function renderStatValue(
  col: StatColumn,
  p: PortfolioStatsRow,
  currency?: string,
): React.ReactNode {
  const raw = p.stats[col.key];
  if (raw == null) return '—';
  const value = Number(raw);
  const text =
    col.format === 'currency'
      ? formatCurrency(value, currency)
      : (FORMAT_FN[col.format]?.(value) ?? String(raw));
  return col.colorize ? (
    <span className={getColorClass(col.invert ? -value : value)}>{text}</span>
  ) : (
    text
  );
}
export function StatisticsTable({
  portfolios,
  colors,
  extendedTable,
  currency,
}: StatisticsTableProps) {
  const { t } = useTranslation();
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const visibleColumns = DEFAULT_COLUMNS.filter((c) => !hiddenColumns.has(c.key));
  const columns: SimpleTableColumn<PortfolioStatsRow>[] = visibleColumns.map((col) => ({
    key: col.key,
    label: t(col.label),
    align: col.format === 'text' ? 'left' : 'right',
    sticky: col.sticky === 'left' ? 'left' : undefined,
    testId: STAT_KEY_TO_TESTID[col.key],
    style: col.minWidth ? { minWidth: col.minWidth } : undefined,
    sortValue: col.key === 'name' ? (p) => p.name : (p) => p.stats[col.key] as number,
    render: (p, i) =>
      col.key === 'name' ? (
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: colors[i] ?? 'hsl(var(--fg-tertiary))' }}
          />
          <span className="truncate">{p.name}</span>
        </div>
      ) : (
        renderStatValue(col, p, currency)
      ),
  }));
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
            {expanded
              ? t('Collapse extended metrics')
              : t('Expand extended metrics ({{count}})', { count: EXTENDED_COLUMNS.length })}
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
                  {t(col.label)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <TableFrame>
        <SortableTable columns={columns} data={portfolios} rowKey={(p) => p.id} />
      </TableFrame>
      {expanded && extendedTable}
    </div>
  );
}
export function ExtendedMetricsTable({ portfolios }: { portfolios: PortfolioStatsRow[] }) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<PortfolioStatsRow>[] = [
    { key: 'name', label: t('Portfolio'), render: (p) => p.name },
    ...EXTENDED_COLUMNS.map((col) => ({
      key: col.key,
      label: t(col.label),
      align: 'right' as const,
      render: (p: PortfolioStatsRow) => renderStatValue(col, p),
    })),
  ];
  return (
    <TableFrame className="mt-4">
      <SimpleTable columns={columns} data={portfolios} rowKey={(p) => p.id} />
    </TableFrame>
  );
}
const HORIZON_LABELS = [
  'about.limits.backtestRangeValue',
  'about.limits.backtestRangeValue',
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
