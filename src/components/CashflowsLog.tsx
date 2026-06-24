/**
 * @file 现金流日志
 * @description 展示回测期间的资金流入流出明细，包括投入、分红及期末余额
 */
import type { BacktestParameters } from '../../shared/types';

/** 现金流日志 Props */
interface CashflowsLogProps {
  parameters: BacktestParameters;
}

const FREQ_LABELS: Record<string, string> = {
  yearly: '每年',
  quarterly: '每季度',
  monthly: '每月',
  weekly: '每周',
};

const TYPE_LABELS: Record<string, string> = {
  contribution: '投入',
  withdrawal: '提取',
};

export default function CashflowsLog({ parameters }: CashflowsLogProps) {
  const { cashflowLegs, oneTimeCashflows } = parameters;
  const hasPeriodic = cashflowLegs && cashflowLegs.length > 0;
  const hasOneTime = oneTimeCashflows && oneTimeCashflows.length > 0;

  if (!hasPeriodic && !hasOneTime) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">现金流日志</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>未设置现金流</div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">现金流日志</div>

      {hasPeriodic && (
        <div style={{ marginBottom: '16px' }}>
          <div
            className="text-[12px] font-semibold mb-2"
            style={{ color: 'var(--text-strong)' }}
          >
            周期性现金流
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    频率
                  </th>
                  <th className="text-[12px] font-semibold text-right py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    金额
                  </th>
                  <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    类型
                  </th>
                  <th className="text-[12px] font-semibold text-right py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    偏移(日)
                  </th>
                  <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    截止日期
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashflowLegs.map((leg, idx) => {
                  const isAlt = idx % 2 === 1;
                  return (
                    <tr key={leg.id} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
                      <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {FREQ_LABELS[leg.frequency] || leg.frequency}
                      </td>
                      <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: leg.type === 'contribution' ? 'var(--success)' : 'var(--error)', borderBottom: '1px solid var(--border-soft)' }}>
                        {leg.type === 'withdrawal' ? '-' : '+'}{leg.amount.toLocaleString()}
                      </td>
                      <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {TYPE_LABELS[leg.type] || leg.type}
                      </td>
                      <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {leg.offset}
                      </td>
                      <td className="text-[13px] py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {leg.until || '持续至回测结束'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasOneTime && (
        <div>
          <div
            className="text-[12px] font-semibold mb-2"
            style={{ color: 'var(--text-strong)' }}
          >
            一次性现金流
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    日期
                  </th>
                  <th className="text-[12px] font-semibold text-right py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    金额
                  </th>
                  <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    类型
                  </th>
                </tr>
              </thead>
              <tbody>
                {oneTimeCashflows.map((cf, idx) => {
                  const isAlt = idx % 2 === 1;
                  return (
                    <tr key={cf.id} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
                      <td className="text-[13px] py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {cf.date}
                      </td>
                      <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: cf.type === 'contribution' ? 'var(--success)' : 'var(--error)', borderBottom: '1px solid var(--border-soft)' }}>
                        {cf.type === 'withdrawal' ? '-' : '+'}{cf.amount.toLocaleString()}
                      </td>
                      <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                        {TYPE_LABELS[cf.type] || cf.type}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
