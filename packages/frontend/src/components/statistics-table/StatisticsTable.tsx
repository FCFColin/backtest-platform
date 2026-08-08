import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Settings2, Info } from 'lucide-react';
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
import {
  SortableTable,
  SimpleTable,
  TableFrame,
  type SimpleTableColumn,
} from '@/components/tables.js';
interface StatColumn {
  key: string;
  label: string;
  format: 'currency' | 'percent' | 'duration' | 'number' | 'text';
  colorize?: boolean;
  sticky?: 'left' | 'right';
  minWidth?: string;
}
interface PortfolioStatsRow {
  id: string;
  name: string;
  stats: Record<string, number | string>;
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
  { key: 'cagr', label: 'stats.cagr', format: 'percent', colorize: true },
  { key: 'mwrr', label: 'stats.mwrr', format: 'percent', colorize: true },
  { key: 'maxDrawdown', label: 'Max Drawdown', format: 'percent', colorize: true },
  { key: 'avgDrawdown', label: 'Avg Drawdown', format: 'percent', colorize: true },
  { key: 'longestDrawdown', label: 'statsTable.longestDrawdown', format: 'duration' },
  { key: 'volatility', label: 'Volatility', format: 'percent' },
  { key: 'sharpe', label: 'backtest.sharpeRatio', format: 'number' },
  { key: 'sortino', label: 'lumpSumDca.stats.sortino', format: 'number' },
  { key: 'calmar', label: 'lumpSumDca.stats.calmar', format: 'number' },
  { key: 'ulcerIndex', label: 'statsTable.ulcerIndex', format: 'number' },
  { key: 'upi', label: 'UPI', format: 'number' },
  { key: 'diversificationRatio', label: 'statsTable.diversificationRatio', format: 'number' },
  { key: 'beta', label: 'Beta', format: 'number' },
];
interface StatisticsTableProps {
  portfolios: PortfolioStatsRow[];
  colors: string[];
  onExport?: () => void;
  extendedTable?: React.ReactNode;
}
const FORMAT_FN: Record<string, (v: number) => string> = {
  currency: formatCurrency,
  percent: fmtPct,
  duration: formatDuration,
  number: fmtNum,
};
function renderStatValue(col: StatColumn, p: PortfolioStatsRow): React.ReactNode {
  const raw = p.stats[col.key];
  if (raw == null) return '—';
  const value = Number(raw);
  const text = FORMAT_FN[col.format]?.(value) ?? String(raw);
  return col.colorize ? <span className={getColorClass(value)}>{text}</span> : text;
}
export function StatisticsTable({
  portfolios,
  colors,
  onExport,
  extendedTable,
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
    sortValue: col.key === 'name' ? () => 0 : (p) => p.stats[col.key] as number,
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
        renderStatValue(col, p)
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
          {onExport && (
            <Button variant="ghost" size="sm" onClick={onExport} aria-label={t('Export')}>
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <TableFrame>
        <SortableTable columns={columns} data={portfolios} rowKey={(p) => p.id} />
      </TableFrame>
      {expanded && extendedTable}
    </div>
  );
}
const EXTENDED_COLUMNS: StatColumn[] = [
  { key: 'var95', label: 'statsTable.vaR95', format: 'percent', colorize: true },
  { key: 'var99', label: 'statsTable.vaR99', format: 'percent', colorize: true },
  { key: 'cvar95', label: 'statsTable.cvaR95', format: 'percent', colorize: true },
  { key: 'cvar99', label: 'statsTable.cvaR99', format: 'percent', colorize: true },
  { key: 'sortinoBear', label: 'statsTable.sortinoBear', format: 'number' },
  { key: 'sortinoBull', label: 'statsTable.sortinoBull', format: 'number' },
  { key: 'sharpeBear', label: 'statsTable.sharpeBear', format: 'number' },
  { key: 'sharpeBull', label: 'statsTable.sharpeBull', format: 'number' },
  { key: 'skewness', label: 'statsTable.skewness', format: 'number' },
  { key: 'kurtosis', label: 'statsTable.kurtosis', format: 'number' },
  { key: 'kelly', label: 'statsTable.kelly', format: 'percent', colorize: true },
  { key: 'alpha', label: 'stats.alpha', format: 'percent', colorize: true },
  { key: 'r2', label: 'stats.rSquared', format: 'number' },
  { key: 'trackingError', label: 'stats.trackingError', format: 'percent', colorize: true },
  { key: 'infoRatio', label: 'stats.informationRatio', format: 'number' },
  { key: 'bestYear', label: 'summarySidebar.bestYear', format: 'percent', colorize: true },
  { key: 'worstYear', label: 'summarySidebar.worstYear', format: 'percent', colorize: true },
  { key: 'bestMonth', label: 'statsTable.bestMonth', format: 'percent', colorize: true },
  { key: 'worstMonth', label: 'statsTable.worstMonth', format: 'percent', colorize: true },
  { key: 'upCapture', label: 'stats.upsideCapture', format: 'percent', colorize: true },
  { key: 'downCapture', label: 'stats.downsideCapture', format: 'percent', colorize: true },
  {
    key: 'positiveMonthsPct',
    label: 'statsTable.positiveMonths',
    format: 'percent',
    colorize: true,
  },
  {
    key: 'negativeMonthsPct',
    label: 'statsTable.negativeMonths',
    format: 'percent',
    colorize: true,
  },
];
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
  'stats.horizon10y',
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
