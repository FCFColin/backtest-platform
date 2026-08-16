import { useTranslation } from 'react-i18next';
import { Card, PortfolioDot } from '@/components/ui/uiComponents.js';
import { fmtPct, fmtNum } from '@/utils/format.js';
import { cn } from '@/lib/utils.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import type { Statistics } from '@backtest/shared';
interface SummarySidebarProps {
  stats: Statistics;
  totalYears: number;
  positiveYears: number;
  name?: string;
  color?: string;
}
interface MetricItem {
  labelKey: string;
  value: string;
  colorClass: string;
  testId: string;
}
type MetricConfig = [
  labelKey: string,
  key: keyof Statistics,
  format: (v: number) => string,
  testId: string,
];
const METRIC_CONFIGS: MetricConfig[] = [
  ['stats.cagr', 'cagr', fmtPct, 'summary-cagr'],
  ['stats.totalReturn', 'totalReturn', fmtPct, 'summary-total-return'],
  ['Max Drawdown', 'maxDrawdown', fmtPct, 'summary-max-drawdown'],
  ['backtest.sharpeRatio', 'sharpe', fmtNum, 'summary-sharpe'],
  ['lumpSumDca.stats.sortino', 'sortino', fmtNum, 'summary-sortino'],
  ['summarySidebar.bestYear', 'bestYear', fmtPct, 'summary-best-year'],
  ['summarySidebar.worstYear', 'worstYear', fmtPct, 'summary-worst-year'],
];
function buildMetrics(stats: Statistics, totalYears: number, positiveYears: number): MetricItem[] {
  const fromStat = ([labelKey, key, format, testId]: MetricConfig): MetricItem => ({
    labelKey,
    value: format(stats[key] as number),
    colorClass: getColorClass(stats[key] as number),
    testId,
  });
  return [
    ...METRIC_CONFIGS.map(fromStat),
    {
      labelKey: 'summarySidebar.positiveYears',
      value: `${positiveYears} / ${totalYears}`,
      colorClass: 'text-fg',
      testId: 'summary-positive-years',
    },
  ];
}
export function SummarySidebar({
  stats,
  totalYears,
  positiveYears,
  name,
  color,
}: SummarySidebarProps) {
  const { t } = useTranslation();
  const metrics = buildMetrics(stats, totalYears, positiveYears);
  return (
    <>
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 lg:hidden"
        role="list"
        aria-label={t('Key Metrics')}
      >
        {metrics.map((m) => (
          <Card
            key={m.labelKey}
            role="listitem"
            className="flex-shrink-0 min-w-[130px] p-3"
            data-testid={m.testId}
          >
            <div className="text-label-tiny text-fg-tertiary mb-1 whitespace-nowrap">
              {t(m.labelKey)}
            </div>
            <div className={cn('text-body font-mono tabular-nums font-semibold', m.colorClass)}>
              {m.value}
            </div>
          </Card>
        ))}
      </div>
      <Card className="hidden lg:block p-4 lg:sticky lg:top-15" data-testid="summary-sidebar">
        <h3 className="text-h3 mb-3">{t('Key Metrics')}</h3>
        {name && (
          <div className="flex items-center gap-1.5 mb-3">
            <PortfolioDot color={color ?? ''} className="shrink-0" />
            <span className="text-caption text-fg-secondary truncate">{name}</span>
          </div>
        )}
        <dl className="space-y-2.5">
          {metrics.map((m) => (
            <div
              key={m.labelKey}
              className="flex items-center justify-between gap-3"
              data-testid={m.testId}
            >
              <dt className="text-caption text-fg-tertiary whitespace-nowrap">{t(m.labelKey)}</dt>
              <dd
                className={cn(
                  'text-caption font-mono tabular-nums font-semibold text-right',
                  m.colorClass,
                )}
              >
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
