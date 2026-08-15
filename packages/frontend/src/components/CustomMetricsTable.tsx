import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { PortfolioResult, Statistics } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  InfoTooltip,
} from './ui/uiComponents.js';
import { TableFrame, SimpleTable, type SimpleTableColumn } from './tables.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtPct, fmtRatio, fmtNum } from '@/utils/format.js';
import { STAT_KEY_TO_TESTID, type StatRow } from './statistics-table/types.js';
interface CustomMetricsTableProps {
  portfolios: PortfolioResult[];
}
const ALL_METRICS: StatRow[] = [
  { label: 'stats.cagr', key: 'cagr', fmt: 'pct', colorize: true },
  { label: 'stats.mwrr', key: 'mwrr', fmt: 'pct', colorize: true },
  { label: 'stats.totalReturn', key: 'totalReturn', fmt: 'pct', colorize: true },
  { label: 'backtest.stdev', key: 'stdev', fmt: 'pct' },
  { label: 'backtest.sharpeRatio', key: 'sharpe', fmt: 'num' },
  { label: 'lumpSumDca.stats.sortino', key: 'sortino', fmt: 'num' },
  { label: 'lumpSumDca.stats.calmar', key: 'calmar', fmt: 'num' },
  { label: 'Max Drawdown', key: 'maxDrawdown', fmt: 'pct', colorize: true },
  { label: 'analysis.ulcerIndex', key: 'ulcerIndex', fmt: 'num' },
  { label: 'Beta', key: 'beta', fmt: 'num' },
  { label: 'stats.alpha', key: 'alpha', fmt: 'pct', colorize: true },
  { label: 'stats.rSquared', key: 'rSquared', fmt: 'num' },
  { label: 'stats.trackingError', key: 'trackingError', fmt: 'pct', colorize: true },
  { label: 'stats.informationRatio', key: 'informationRatio', fmt: 'num' },
  { label: 'stats.upsideCapture', key: 'upsideCapture', fmt: 'pct', colorize: true },
  { label: 'stats.downsideCapture', key: 'downsideCapture', fmt: 'pct', colorize: true },
  { label: 'stats.skewnessDaily', key: 'skewnessDaily' as keyof Statistics, fmt: 'num' },
  {
    label: 'stats.excessKurtosisDaily',
    key: 'excessKurtosisDaily' as keyof Statistics,
    fmt: 'num',
  },
  { label: 'stats.varDaily5', key: 'varDaily5' as keyof Statistics, fmt: 'pct', colorize: true },
  { label: 'stats.cvarDaily5', key: 'cvarDaily5' as keyof Statistics, fmt: 'pct', colorize: true },
  { label: 'stats.swr10y', key: 'swr10y', fmt: 'pct', colorize: true },
  { label: 'stats.pwr10y', key: 'pwr10y', fmt: 'pct', colorize: true },
  { label: 'stats.swr30y', key: 'swr30y', fmt: 'pct', colorize: true },
  { label: 'stats.pwr30y', key: 'pwr30y', fmt: 'pct', colorize: true },
];
const DEFAULT_KEYS: (keyof Statistics)[] = [
  'cagr',
  'stdev',
  'sharpe',
  'sortino',
  'maxDrawdown',
  'calmar',
  'beta',
  'alpha',
  'swr10y',
  'pwr30y',
];
function formatMetricValue(v: number | undefined, fmt: StatRow['fmt']): string {
  if (v == null) return '—';
  if (fmt === 'pct') return fmtPct(v);
  if (fmt === 'ratio') return fmtRatio(v);
  if (fmt === 'num') return fmtNum(v, 2);
  return String(v);
}
function MetricLabel({ row }: { row: StatRow }) {
  const { t } = useTranslation();
  if (!row.description) {
    return <>{t(row.label)}</>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span>{t(row.label)}</span>
      <InfoTooltip description={t(row.description)} />
    </span>
  );
}
interface MetricRowsTableProps {
  rows: StatRow[];
  portfolios: PortfolioResult[];
}
export function MetricRowsTable({ rows, portfolios }: MetricRowsTableProps) {
  const { t } = useTranslation();
  const visibleRows = rows.filter((row) => portfolios.some((p) => p.statistics[row.key] != null));
  const columns: SimpleTableColumn<StatRow>[] = [
    {
      key: 'label',
      label: t('Metric'),
      sticky: 'left',
      style: { minWidth: 160 },
      render: (row) => <MetricLabel row={row} />,
    },
    ...portfolios.map((p, i) => ({
      key: p.name,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full align-middle"
            style={{ backgroundColor: getPortfolioColor(i) }}
          />
          {p.name}
        </span>
      ),
      align: 'right' as const,
      render: (row: StatRow) => {
        const val = p.statistics[row.key] as number | undefined;
        const colorClass = val == null || !row.colorize ? '' : getColorClass(val);
        return <span className={colorClass}>{formatMetricValue(val, row.fmt)}</span>;
      },
    })),
  ];
  return (
    <TableFrame>
      <SimpleTable
        columns={columns}
        data={visibleRows}
        rowKey={(row) => row.key}
        caption={t('My Metrics')}
        testIdOf={(row) => STAT_KEY_TO_TESTID[row.key]}
      />
    </TableFrame>
  );
}
function MetricSelector({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<keyof Statistics>;
  onToggle: (key: keyof Statistics) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          {t('Select Metrics ({{selected}}/{{total}})', {
            selected: selectedKeys.size,
            total: ALL_METRICS.length,
          })}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[320px] overflow-y-auto">
        {ALL_METRICS.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.key}
            checked={selectedKeys.has(m.key)}
            onCheckedChange={() => onToggle(m.key)}
          >
            {t(m.label)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export default function CustomMetricsTable({ portfolios }: CustomMetricsTableProps) {
  const { t } = useTranslation();
  const [selectedKeys, setSelectedKeys] = useState<Set<keyof Statistics>>(
    () => new Set(DEFAULT_KEYS),
  );
  const toggleKey = (key: keyof Statistics) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const visibleMetrics = ALL_METRICS.filter((m) => selectedKeys.has(m.key));
  if (portfolios.length === 0) {
    return (
      <ChartCard title={t('My Metrics')}>
        <TableEmpty message={t('No data')} />
      </ChartCard>
    );
  }
  return (
    <ChartCard
      title={t('My Metrics')}
      headerExtra={<MetricSelector selectedKeys={selectedKeys} onToggle={toggleKey} />}
    >
      {visibleMetrics.length === 0 ? (
        <div className="text-label py-5 text-center text-fg-tertiary">
          {t('Please select at least one metric')}
        </div>
      ) : (
        <MetricRowsTable rows={visibleMetrics} portfolios={portfolios} />
      )}
    </ChartCard>
  );
}
