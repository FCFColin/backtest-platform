import { useTranslation } from 'react-i18next';
import type { BacktestParameters } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { cn } from '@/lib/utils';
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
const TH_BASE =
  'py-2.5 px-3 text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle whitespace-nowrap';
const TD_BASE = 'py-2 px-3 text-body border-b border-border-subtle whitespace-nowrap';
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
            <th className={cn(TH_BASE, 'text-left')}>{t('Frequency')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('Amount')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('Type')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('Offset Days')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('End Date')}</th>
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
                {leg.until || t('Until End of Backtest')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
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
            <th className={cn(TH_BASE, 'text-left')}>{t('Date')}</th>
            <th className={cn(TH_BASE, 'text-right')}>{t('Amount')}</th>
            <th className={cn(TH_BASE, 'text-left')}>{t('Type')}</th>
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
export default function CashflowsLog({ parameters }: CashflowsLogProps) {
  const { t } = useTranslation();
  const { cashflowLegs, oneTimeCashflows } = parameters;
  const hasPeriodic = cashflowLegs && cashflowLegs.length > 0;
  const hasOneTime = oneTimeCashflows && oneTimeCashflows.length > 0;
  if (!hasPeriodic && !hasOneTime) {
    return (
      <ChartCard title={t('Cashflows Log')}>
        <div className="text-body text-fg-tertiary">{t('Not Set')}</div>
      </ChartCard>
    );
  }
  return (
    <ChartCard title={t('Cashflows Log')}>
      {hasPeriodic && cashflowLegs && (
        <div className="mb-4">
          <div className="text-caption font-semibold mb-2 text-fg">{t('Periodic')}</div>
          <PeriodicCashflowsTable legs={cashflowLegs} />
        </div>
      )}
      {hasOneTime && oneTimeCashflows && (
        <div>
          <div className="text-caption font-semibold mb-2 text-fg">{t('One-Time')}</div>
          <OneTimeCashflowsTable cashflows={oneTimeCashflows} />
        </div>
      )}
    </ChartCard>
  );
}
