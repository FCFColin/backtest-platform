/**
 * @file 调仓统计组件
 * @description 展示各投资组合的调仓频率、阈值及带宽等配置信息
 */
import type { Portfolio, RebalanceFrequency } from '../../shared/types';
import { CHART_COLORS } from '../../shared/types';

/** 调仓统计组件 Props */
interface RebalancingStatsProps {
  portfolios: Array<Pick<Portfolio, 'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'>>;
}

const FREQ_LABELS: Record<RebalanceFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  none: '不调仓',
  threshold: '偏离调仓',
};

export default function RebalancingStats({ portfolios }: RebalancingStatsProps) {
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">再平衡统计</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>暂无再平衡统计数据</div>
      </div>
    );
  }

  const hasRebalanceInfo = portfolios.some(
    (p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none'
  );

  if (!hasRebalanceInfo) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">再平衡统计</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>暂无再平衡统计数据</div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">再平衡统计</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                组合
              </th>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                调仓频率
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                偏移(日)
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                偏离阈值
              </th>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                再平衡带
              </th>
            </tr>
          </thead>
          <tbody>
            {portfolios.map((portfolio, idx) => {
              const isAlt = idx % 2 === 1;
              const bands = portfolio.rebalanceBands;
              const bandsText = bands?.enabled
                ? `绝对: \u00B1${bands.absoluteBand ?? '-'}%, 相对: \u00B1${bands.relativeBand ?? '-'}%`
                : '未启用';

              return (
                <tr key={portfolio.name} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
                  <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                    />
                    {portfolio.name}
                  </td>
                  <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                    {FREQ_LABELS[portfolio.rebalanceFrequency] || portfolio.rebalanceFrequency}
                  </td>
                  <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                    {portfolio.rebalanceOffset ?? 0}
                  </td>
                  <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                    {portfolio.rebalanceFrequency === 'threshold'
                      ? `${portfolio.rebalanceThreshold ?? 5}%`
                      : '-'}
                  </td>
                  <td className="text-[13px] py-2 px-3" style={{ color: bands?.enabled ? 'var(--text-body)' : 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)' }}>
                    {bandsText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
