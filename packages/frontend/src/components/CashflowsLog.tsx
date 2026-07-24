/**
 * @file 现金流日志
 * @description 展示回测期间的资金流入流出明细，包括投入、分红及期末余额。
 *   基于 shadcn Card（经 ChartCard）+ token 化表格样式。
 */
import { useTranslation } from 'react-i18next';
import type { BacktestParameters } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { cn } from '@/lib/utils';

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

/** 表头基础 className */
const TH_BASE =
  'py-2.5 px-3 text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle whitespace-nowrap';

/** 数据单元格基础 className */
const TD_BASE =
  'py-2 px-3 text-body border-b border-border-subtle whitespace-nowrap';

/** 周期性现金流表格 */
function PeriodicCashflowsTable({
  legs,
}: {
  legs: NonNullable<BacktestParameters['cashflowLegs']>;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="bg-elevated">
            <th className={cn(TH_BASE, 'text-left')}>{t('params.frequency')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('params.amount')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('params.type')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('components.cashflowsLog.offsetDays')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('components.cashflowsLog.endDate')}</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, idx) => (
            <tr key={leg.id} className={idx % 2 === 1 ? 'bg-elevated/40' : 'bg-transparent'}>
              <td className={cn(TD_BASE, 'text-left text-fg-secondary')}>
                {FREQ_LABELS[leg.frequency] || leg.frequency}
              </td>
              <td
                className={cn(
                  TD_BASE,
                  'text-right font-mono tabular-nums',
                  leg.type === 'contribution' ? 'text-pos' : 'text-neg',
                )}
              >
                {leg.type === 'withdrawal' ? '-' : '+'}
                {leg.amount.toLocaleString()}
              </td>
              <td className={cn(TD_BASE, 'text-left text-fg-secondary')}>
                {TYPE_LABELS[leg.type] || leg.type}
              </td>
              <td className={cn(TD_BASE, 'text-right font-mono tabular-nums text-fg-secondary')}>
                {leg.offset}
              </td>
              <td className={cn(TD_BASE, 'text-left font-mono tabular-nums text-fg-secondary')}>
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
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="bg-elevated">
            <th className={cn(TH_BASE, 'text-left')}>{t('common.date')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('params.amount')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('params.type')}</th>
          </tr>
        </thead>
        <tbody>
          {cashflows.map((cf, idx) => (
            <tr key={cf.id} className={idx % 2 === 1 ? 'bg-elevated/40' : 'bg-transparent'}>
              <td className={cn(TD_BASE, 'text-left font-mono tabular-nums text-fg-secondary')}>
                {cf.date}
              </td>
              <td
                className={cn(
                  TD_BASE,
                  'text-right font-mono tabular-nums',
                  cf.type === 'contribution' ? 'text-pos' : 'text-neg',
                )}
              >
                {cf.type === 'withdrawal' ? '-' : '+'}
                {cf.amount.toLocaleString()}
              </td>
              <td className={cn(TD_BASE, 'text-left text-fg-secondary')}>
                {TYPE_LABELS[cf.type] || cf.type}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 现金流日志组件。
 * @param props - parameters: 回测参数（含 cashflowLegs / oneTimeCashflows）
 * @returns 渲染的现金流日志卡片（含周期性 + 一次性两表，空态文案）
 */
export default function CashflowsLog({ parameters }: CashflowsLogProps) {
  const { t } = useTranslation();
  const { cashflowLegs, oneTimeCashflows } = parameters;
  const hasPeriodic = cashflowLegs && cashflowLegs.length > 0;
  const hasOneTime = oneTimeCashflows && oneTimeCashflows.length > 0;

  if (!hasPeriodic && !hasOneTime) {
    return (
      <ChartCard title={t('components.cashflowsLog.title')}>
        <div className="text-body text-fg-tertiary">
          {t('components.cashflowsLog.notSet')}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={t('components.cashflowsLog.title')}>
      {hasPeriodic && cashflowLegs && (
        <div className="mb-4">
          <div className="text-caption font-semibold mb-2 text-fg">
            {t('components.cashflowsLog.periodic')}
          </div>
          <PeriodicCashflowsTable legs={cashflowLegs} />
        </div>
      )}

      {hasOneTime && oneTimeCashflows && (
        <div>
          <div className="text-caption font-semibold mb-2 text-fg">
            {t('components.cashflowsLog.oneTime')}
          </div>
          <OneTimeCashflowsTable cashflows={oneTimeCashflows} />
        </div>
      )}
    </ChartCard>
  );
}
