import { useTranslation } from 'react-i18next';
import type { Portfolio, RebalanceFrequency } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { cn } from '@/lib/utils';
interface RebalancingStatsProps {
  portfolios: Array<Pick<Portfolio, 'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'>>;
}
const FREQ_LABELS: Record<RebalanceFrequency, string> = {
  daily: 'portfolio.rebalanceDaily',
  weekly: 'portfolio.rebalanceWeekly',
  monthly: 'portfolio.rebalanceMonthly',
  quarterly: 'portfolio.rebalanceQuarterly',
  annual: 'portfolio.rebalanceAnnual',
  none: 'portfolio.rebalanceNone',
  threshold: 'portfolio.rebalanceThreshold'
};
function EmptyState() {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('tabs.rebalancing')}>
      <div className="text-body text-fg-tertiary">{t('components.rebalancingStats.noData')}</div>
    </ChartCard>
  );
}
function RebalancingStatsHeader() {
  const { t } = useTranslation();
  const thBase = 'py-2.5 px-3 text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle whitespace-nowrap';
  return (
    <tr className="bg-elevated">
      <th className={cn(thBase, 'text-left')}>{t('backtest.portfolio')}</th>
      <th className={cn(thBase, 'text-left')}>{t('efficientFrontier.params.rebalanceFreq')}</th>
      <th className={cn(thBase, 'text-right')}>{t('components.rebalancingStats.offsetDays')}</th>
      <th className={cn(thBase, 'text-right')}>{t('components.rebalancingStats.deviationThreshold')}</th>
      <th className={cn(thBase, 'text-left')}>{t('components.rebalancingStats.rebalanceBands')}</th>
    </tr>
  );
}
function RebalancingStatsRow({ portfolio, idx }: { portfolio: Pick<Portfolio, 'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'>; idx: number }) {
  const { t } = useTranslation();
  const isAlt = idx % 2 === 1;
  const bands = portfolio.rebalanceBands;
  const bandsText = bands?.enabled
    ? t('components.rebalancingStats.bandsText', {
        absolute: bands.absoluteBand ?? '-',
        relative: bands.relativeBand ?? '-'
      })
    : t('components.rebalancingStats.bandsDisabled');
  const tdBase = 'py-2 px-3 text-body border-b border-border-subtle whitespace-nowrap';
  return (
    <tr key={portfolio.name} className={isAlt ? 'bg-elevated' : 'bg-transparent'}>
      <td className={cn(tdBase, 'text-left text-fg')}>
        <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
        {portfolio.name}
      </td>
      <td className={cn(tdBase, 'text-left text-fg-secondary')}>{t(FREQ_LABELS[portfolio.rebalanceFrequency] || portfolio.rebalanceFrequency)}</td>
      <td className={cn(tdBase, 'text-right font-mono tabular-nums text-fg-secondary')}>{portfolio.rebalanceOffset ?? 0}</td>
      <td className={cn(tdBase, 'text-right font-mono tabular-nums text-fg-secondary')}>{portfolio.rebalanceFrequency === 'threshold' ? `${portfolio.rebalanceThreshold ?? 5}%` : '-'}</td>
      <td className={cn(tdBase, 'text-left', bands?.enabled ? 'text-fg-secondary' : 'text-fg-tertiary')}>{bandsText}</td>
    </tr>
  );
}
export default function RebalancingStats({ portfolios }: RebalancingStatsProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return <EmptyState />;
  const hasRebalanceInfo = portfolios.some((p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none');
  if (!hasRebalanceInfo) return <EmptyState />;
  return (
    <ChartCard title={t('tabs.rebalancing')}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <RebalancingStatsHeader />
          </thead>
          <tbody>
            {portfolios.map((portfolio, idx) => (
              <RebalancingStatsRow key={portfolio.name} portfolio={portfolio} idx={idx} />
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
