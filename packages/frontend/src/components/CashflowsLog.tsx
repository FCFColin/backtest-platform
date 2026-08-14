import { useTranslation } from 'react-i18next';
import type { BacktestParameters } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { SimpleTable, type SimpleTableColumn } from './tables.js';
interface CashflowsLogProps {
  parameters: BacktestParameters;
}
const FREQ_LABELS: Record<string, string> = {
  yearly: 'Annual',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  weekly: 'Weekly',
};
const TYPE_LABELS: Record<string, string> = {
  contribution: 'params.contribution',
  withdrawal: 'params.withdrawal',
};
const muted = 'text-fg-secondary';
const amountSpan = (type: string, sign: string, amount: number) => (
  <span className={type === 'contribution' ? 'text-pos' : 'text-neg'}>
    {sign}
    {amount.toLocaleString()}
  </span>
);
function PeriodicCashflowsTable({
  legs,
}: {
  legs: NonNullable<BacktestParameters['cashflowLegs']>;
}) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof legs)[number]>[] = [
    {
      key: 'frequency',
      label: t('Frequency'),
      render: (leg) => (
        <span className={muted}>{t(FREQ_LABELS[leg.frequency]) || leg.frequency}</span>
      ),
    },
    {
      key: 'amount',
      label: t('Amount'),
      align: 'right',
      render: (leg) => amountSpan(leg.type, leg.type === 'withdrawal' ? '-' : '+', leg.amount),
    },
    {
      key: 'type',
      label: t('Type'),
      render: (leg) => <span className={muted}>{TYPE_LABELS[leg.type] || leg.type}</span>,
    },
    {
      key: 'until',
      label: t('End Date'),
      render: (leg) => (
        <span className={`font-mono tabular-nums ${muted}`}>
          {leg.until || t('Until End of Backtest')}
        </span>
      ),
    },
  ];
  return <SimpleTable columns={columns} data={legs} rowKey={(l) => l.id} />;
}
function OneTimeCashflowsTable({
  cashflows,
}: {
  cashflows: NonNullable<BacktestParameters['oneTimeCashflows']>;
}) {
  const { t } = useTranslation();
  const columns: SimpleTableColumn<(typeof cashflows)[number]>[] = [
    {
      key: 'date',
      label: t('Date'),
      render: (cf) => <span className={`font-mono tabular-nums ${muted}`}>{cf.date}</span>,
    },
    {
      key: 'amount',
      label: t('Amount'),
      align: 'right',
      render: (cf) => amountSpan(cf.type, cf.type === 'withdrawal' ? '-' : '+', cf.amount),
    },
    {
      key: 'type',
      label: t('Type'),
      render: (cf) => <span className={muted}>{TYPE_LABELS[cf.type] || cf.type}</span>,
    },
  ];
  return <SimpleTable columns={columns} data={cashflows} rowKey={(c) => c.id} />;
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
