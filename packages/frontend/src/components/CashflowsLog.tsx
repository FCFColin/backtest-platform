/**
 * @file 现金流日志
 * @description 展示回测期间的资金流入流出明细，包括投入、分红及期末余额
 */
import type { BacktestParameters } from '@backtest/shared/types';

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

const TH_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
};

const TD_BORDER: React.CSSProperties = {
  borderBottom: '1px solid var(--border-soft)',
};

/** 周期性现金流表格 */
function PeriodicCashflowsTable({
  legs,
}: {
  legs: NonNullable<BacktestParameters['cashflowLegs']>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              频率
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TH_STYLE}>
              金额
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              类型
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TH_STYLE}>
              偏移(日)
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              截止日期
            </th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, idx) => (
            <tr
              key={leg.id}
              style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              <td
                className="text-[13px] py-2 px-3"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {FREQ_LABELS[leg.frequency] || leg.frequency}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{
                  ...TD_BORDER,
                  color: leg.type === 'contribution' ? 'var(--success)' : 'var(--error)',
                }}
              >
                {leg.type === 'withdrawal' ? '-' : '+'}
                {leg.amount.toLocaleString()}
              </td>
              <td
                className="text-[13px] py-2 px-3"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {TYPE_LABELS[leg.type] || leg.type}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {leg.offset}
              </td>
              <td
                className="text-[13px] py-2 px-3 font-mono"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {leg.until || '持续至回测结束'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 一次性现金流表格 */
function OneTimeCashflowsTable({
  cashflows,
}: {
  cashflows: NonNullable<BacktestParameters['oneTimeCashflows']>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              日期
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TH_STYLE}>
              金额
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              类型
            </th>
          </tr>
        </thead>
        <tbody>
          {cashflows.map((cf, idx) => (
            <tr
              key={cf.id}
              style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              <td
                className="text-[13px] py-2 px-3 font-mono"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {cf.date}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{
                  ...TD_BORDER,
                  color: cf.type === 'contribution' ? 'var(--success)' : 'var(--error)',
                }}
              >
                {cf.type === 'withdrawal' ? '-' : '+'}
                {cf.amount.toLocaleString()}
              </td>
              <td
                className="text-[13px] py-2 px-3"
                style={{ ...TD_BORDER, color: 'var(--text-body)' }}
              >
                {TYPE_LABELS[cf.type] || cf.type}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CashflowsLog({ parameters }: CashflowsLogProps) {
  const { cashflowLegs, oneTimeCashflows } = parameters;
  const hasPeriodic = cashflowLegs && cashflowLegs.length > 0;
  const hasOneTime = oneTimeCashflows && oneTimeCashflows.length > 0;

  if (!hasPeriodic && !hasOneTime) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">现金流日志</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          未设置现金流
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">现金流日志</div>

      {hasPeriodic && cashflowLegs && (
        <div style={{ marginBottom: '16px' }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
            周期性现金流
          </div>
          <PeriodicCashflowsTable legs={cashflowLegs} />
        </div>
      )}

      {hasOneTime && oneTimeCashflows && (
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
            一次性现金流
          </div>
          <OneTimeCashflowsTable cashflows={oneTimeCashflows} />
        </div>
      )}
    </div>
  );
}
