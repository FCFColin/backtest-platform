/**
 * @file 调仓统计组件
 * @description 展示各投资组合的调仓频率、阈值及带宽等配置信息
 */
import { useTranslation } from 'react-i18next';
import type { Portfolio, RebalanceFrequency } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { TABLE_TH_CLASS, TABLE_TH_STYLE, TABLE_TD_CLASS, TABLE_TD_BORDER } from './tableStyles.js';

/** 调仓统计组件 Props */
interface RebalancingStatsProps {
  portfolios: Array<
    Pick<
      Portfolio,
      'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
    >
  >;
}

const FREQ_LABELS: Record<RebalanceFrequency, string> = {
  daily: 'portfolio.rebalanceDaily',
  weekly: 'portfolio.rebalanceWeekly',
  monthly: 'portfolio.rebalanceMonthly',
  quarterly: 'portfolio.rebalanceQuarterly',
  annual: 'portfolio.rebalanceAnnual',
  none: 'portfolio.rebalanceNone',
  threshold: 'portfolio.rebalanceThreshold',
};

/** 空状态 */
function EmptyState() {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('tabs.rebalancing')}>
      <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
        {t('components.rebalancingStats.noData')}
      </div>
    </ChartCard>
  );
}

/** 再平衡统计表头 */
function RebalancingStatsHeader() {
  const { t } = useTranslation();
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th className={`${TABLE_TH_CLASS} text-left`} style={TABLE_TH_STYLE}>
        {t('backtest.portfolio')}
      </th>
      <th className={`${TABLE_TH_CLASS} text-left`} style={TABLE_TH_STYLE}>
        {t('efficientFrontier.params.rebalanceFreq')}
      </th>
      <th className={`${TABLE_TH_CLASS} text-right`} style={TABLE_TH_STYLE}>
        {t('components.rebalancingStats.offsetDays')}
      </th>
      <th className={`${TABLE_TH_CLASS} text-right`} style={TABLE_TH_STYLE}>
        {t('components.rebalancingStats.deviationThreshold')}
      </th>
      <th className={`${TABLE_TH_CLASS} text-left`} style={TABLE_TH_STYLE}>
        {t('components.rebalancingStats.rebalanceBands')}
      </th>
    </tr>
  );
}

/** 再平衡统计表体行 */
function RebalancingStatsRow({
  portfolio,
  idx,
}: {
  portfolio: Pick<
    Portfolio,
    'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
  >;
  idx: number;
}) {
  const { t } = useTranslation();
  const isAlt = idx % 2 === 1;
  const bands = portfolio.rebalanceBands;
  const bandsText = bands?.enabled
    ? t('components.rebalancingStats.bandsText', {
        absolute: bands.absoluteBand ?? '-',
        relative: bands.relativeBand ?? '-',
      })
    : t('components.rebalancingStats.bandsDisabled');
  return (
    <tr
      key={portfolio.name}
      style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}
    >
      <td className={TABLE_TD_CLASS} style={{ ...TABLE_TD_BORDER, color: 'var(--text-strong)' }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
        />
        {portfolio.name}
      </td>
      <td className={TABLE_TD_CLASS} style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}>
        {t(FREQ_LABELS[portfolio.rebalanceFrequency] || portfolio.rebalanceFrequency)}
      </td>
      <td
        className="text-[13px] text-right py-2 px-3 font-mono"
        style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
      >
        {portfolio.rebalanceOffset ?? 0}
      </td>
      <td
        className="text-[13px] text-right py-2 px-3 font-mono"
        style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
      >
        {portfolio.rebalanceFrequency === 'threshold'
          ? `${portfolio.rebalanceThreshold ?? 5}%`
          : '-'}
      </td>
      <td
        className={TABLE_TD_CLASS}
        style={{
          ...TABLE_TD_BORDER,
          color: bands?.enabled ? 'var(--text-body)' : 'var(--text-muted)',
        }}
      >
        {bandsText}
      </td>
    </tr>
  );
}

export default function RebalancingStats({ portfolios }: RebalancingStatsProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return <EmptyState />;

  const hasRebalanceInfo = portfolios.some(
    (p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none',
  );

  if (!hasRebalanceInfo) return <EmptyState />;

  return (
    <ChartCard title={t('tabs.rebalancing')}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
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
