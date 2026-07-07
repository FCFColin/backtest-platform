/**
 * @file 调仓统计组件
 * @description 展示各投资组合的调仓频率、阈值及带宽等配置信息
 */
import type { Portfolio, RebalanceFrequency } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';

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
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  annual: '每年',
  none: '不调仓',
  threshold: '偏离调仓',
};

const EMPTY_STATE = (
  <div className="chart-card">
    <div className="chart-card-title">再平衡统计</div>
    <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
      暂无再平衡统计数据
    </div>
  </div>
);

/** 再平衡统计表头 */
function RebalancingStatsHeader() {
  const thStyle = {
    className: 'text-[12px] font-semibold py-2.5 px-3',
    style: { color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' },
  };
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th
        {...thStyle}
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        组合
      </th>
      <th
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        调仓频率
      </th>
      <th
        className="text-[12px] font-semibold text-right py-2.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        偏移(日)
      </th>
      <th
        className="text-[12px] font-semibold text-right py-2.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        偏离阈值
      </th>
      <th
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
      >
        再平衡带
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
  const isAlt = idx % 2 === 1;
  const bands = portfolio.rebalanceBands;
  const bandsText = bands?.enabled
    ? `绝对: ±${bands.absoluteBand ?? '-'}%, 相对: ±${bands.relativeBand ?? '-'}%`
    : '未启用';
  const tdBase = {
    className: 'text-[13px] py-2 px-3',
    style: { borderBottom: '1px solid var(--border-soft)' },
  };
  return (
    <tr
      key={portfolio.name}
      style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}
    >
      <td {...tdBase} style={{ ...tdBase.style, color: 'var(--text-strong)' }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
        />
        {portfolio.name}
      </td>
      <td {...tdBase} style={{ ...tdBase.style, color: 'var(--text-body)' }}>
        {FREQ_LABELS[portfolio.rebalanceFrequency] || portfolio.rebalanceFrequency}
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
        {...tdBase}
        style={{
          ...tdBase.style,
          color: bands?.enabled ? 'var(--text-body)' : 'var(--text-muted)',
        }}
      >
        {bandsText}
      </td>
    </tr>
  );
}

export default function RebalancingStats({ portfolios }: RebalancingStatsProps) {
  if (portfolios.length === 0) return EMPTY_STATE;

  const hasRebalanceInfo = portfolios.some(
    (p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none',
  );

  if (!hasRebalanceInfo) return EMPTY_STATE;

  return (
    <div className="chart-card">
      <div className="chart-card-title">再平衡统计</div>
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
    </div>
  );
}
