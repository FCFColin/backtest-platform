/**
 * @file 现金流日志
 * @description 展示回测期间的资金流入流出明细，包括投入、分红及期末余额
 */
import { useTranslation } from 'react-i18next';
import type { BacktestParameters } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { TABLE_TH_STYLE, TABLE_TD_BORDER } from './tableStyles.js';

/** 现金流日志 Props */
interface CashflowsLogProps {
  parameters: BacktestParameters;
}

const FREQ_LABELS: Record<string, string> = {
  yearly: 'params.yearly',
  quarterly: 'params.quarterly',
  monthly: 'params.monthly',
  weekly: 'params.weekly',
};

const TYPE_LABELS: Record<string, string> = {
  contribution: 'params.contribution',
  withdrawal: 'params.withdrawal',
};

/** 周期性现金流表格 */
function PeriodicCashflowsTable({
  legs,
}: {
  legs: NonNullable<BacktestParameters['cashflowLegs']>;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
              {t('params.frequency')}
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TABLE_TH_STYLE}>
              {t('params.amount')}
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
              {t('params.type')}
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TABLE_TH_STYLE}>
              {t('components.cashflowsLog.offsetDays')}
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
              {t('components.cashflowsLog.endDate')}
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
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
              >
                {FREQ_LABELS[leg.frequency] || leg.frequency}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{
                  ...TABLE_TD_BORDER,
                  color: leg.type === 'contribution' ? 'var(--success)' : 'var(--error)',
                }}
              >
                {leg.type === 'withdrawal' ? '-' : '+'}
                {leg.amount.toLocaleString()}
              </td>
              <td
                className="text-[13px] py-2 px-3"
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
              >
                {TYPE_LABELS[leg.type] || leg.type}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
              >
                {leg.offset}
              </td>
              <td
                className="text-[13px] py-2 px-3 font-mono"
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
              >
                {leg.until || t('components.cashflowsLog.untilEndOfBacktest')}
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
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
              {t('common.date')}
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TABLE_TH_STYLE}>
              {t('params.amount')}
            </th>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
              {t('params.type')}
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
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
              >
                {cf.date}
              </td>
              <td
                className="text-[13px] text-right py-2 px-3 font-mono"
                style={{
                  ...TABLE_TD_BORDER,
                  color: cf.type === 'contribution' ? 'var(--success)' : 'var(--error)',
                }}
              >
                {cf.type === 'withdrawal' ? '-' : '+'}
                {cf.amount.toLocaleString()}
              </td>
              <td
                className="text-[13px] py-2 px-3"
                style={{ ...TABLE_TD_BORDER, color: 'var(--text-body)' }}
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
  const { t } = useTranslation();
  const { cashflowLegs, oneTimeCashflows } = parameters;
  const hasPeriodic = cashflowLegs && cashflowLegs.length > 0;
  const hasOneTime = oneTimeCashflows && oneTimeCashflows.length > 0;

  if (!hasPeriodic && !hasOneTime) {
    return (
      <ChartCard title={t('components.cashflowsLog.title')}>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('components.cashflowsLog.notSet')}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={t('components.cashflowsLog.title')}>
      {hasPeriodic && cashflowLegs && (
        <div style={{ marginBottom: '16px' }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
            {t('components.cashflowsLog.periodic')}
          </div>
          <PeriodicCashflowsTable legs={cashflowLegs} />
        </div>
      )}

      {hasOneTime && oneTimeCashflows && (
        <div>
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
            {t('components.cashflowsLog.oneTime')}
          </div>
          <OneTimeCashflowsTable cashflows={oneTimeCashflows} />
        </div>
      )}
    </ChartCard>
  );
}
