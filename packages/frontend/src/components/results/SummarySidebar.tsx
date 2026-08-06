import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents.js';
import { fmtPct, fmtNum } from '@/utils/format.js';
import { cn } from '@/lib/utils.js';
import type { Statistics } from '@backtest/shared';
interface SummarySidebarProps {
  stats: Statistics;
  totalYears: number;
  positiveYears: number;
}
interface MetricItem {
  labelKey: string;
  value: string;
  tone: 'pos' | 'neg' | 'neutral';
  testId: string;
}
function toneClass(tone: MetricItem['tone']): string {
  if (tone === 'pos') return 'text-pos';
  if (tone === 'neg') return 'text-neg';
  return 'text-fg';
}
function buildMetrics(stats: Statistics, totalYears: number, positiveYears: number): MetricItem[] {
  return [
    {
      labelKey: 'summarySidebar.cagr',
      value: fmtPct(stats.cagr),
      tone: stats.cagr >= 0 ? 'pos' : 'neg',
      testId: 'summary-cagr',
    },
    {
      labelKey: 'summarySidebar.totalReturn',
      value: fmtPct(stats.totalReturn),
      tone: stats.totalReturn >= 0 ? 'pos' : 'neg',
      testId: 'summary-total-return',
    },
    {
      labelKey: 'summarySidebar.maxDrawdown',
      value: fmtPct(stats.maxDrawdown),
      tone: 'neg',
      testId: 'summary-max-drawdown',
    },
    {
      labelKey: 'summarySidebar.sharpe',
      value: fmtNum(stats.sharpe),
      tone: stats.sharpe >= 0 ? 'pos' : 'neg',
      testId: 'summary-sharpe',
    },
    {
      labelKey: 'summarySidebar.sortino',
      value: fmtNum(stats.sortino),
      tone: stats.sortino >= 0 ? 'pos' : 'neg',
      testId: 'summary-sortino',
    },
    {
      labelKey: 'summarySidebar.bestYear',
      value: fmtPct(stats.bestYear),
      tone: stats.bestYear >= 0 ? 'pos' : 'neg',
      testId: 'summary-best-year',
    },
    {
      labelKey: 'summarySidebar.worstYear',
      value: fmtPct(stats.worstYear),
      tone: stats.worstYear >= 0 ? 'pos' : 'neg',
      testId: 'summary-worst-year',
    },
    {
      labelKey: 'summarySidebar.positiveYears',
      value: `${positiveYears} / ${totalYears}`,
      tone: 'neutral',
      testId: 'summary-positive-years',
    },
  ];
}
export function SummarySidebar({ stats, totalYears, positiveYears }: SummarySidebarProps) {
  const { t } = useTranslation();
  const metrics = buildMetrics(stats, totalYears, positiveYears);
  return (
    <>
      {/* 移动端：横向滚动指标行 */}
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
            <div
              className={cn('text-body font-mono tabular-nums font-semibold', toneClass(m.tone))}
            >
              {m.value}
            </div>
          </Card>
        ))}
      </div>
      {/* 桌面端：sticky 指标卡片 */}
      <Card className="hidden lg:block p-4 lg:sticky lg:top-20" data-testid="summary-sidebar">
        <h3 className="text-h3 mb-3">{t('Key Metrics')}</h3>
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
                  toneClass(m.tone),
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
