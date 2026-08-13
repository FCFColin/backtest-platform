import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import { AffixInput } from '@/components/ui/uiComponents';
import { LabeledField, SelectField, DateField } from '@/components/form/sharedFields';
import { ParamSection } from './TacticalSignalEditor';
import { REBALANCE_OPTIONS } from './TacticalUtils';

export function BacktestParamsFields({
  idPrefix,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startingValue,
  setStartingValue,
  rebalanceFrequency,
  setRebalanceFrequency,
  children,
}: {
  idPrefix: string;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  rebalanceFrequency: RebalanceFrequency;
  setRebalanceFrequency: (v: RebalanceFrequency) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const valueId = `${idPrefix}-starting-value`;
  return (
    <ParamSection title={t('Backtest Parameters')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
        <DateField
          id={`${idPrefix}-start-date`}
          label={t('Start Date')}
          value={startDate}
          onChange={setStartDate}
        />
        <DateField
          id={`${idPrefix}-end-date`}
          label={t('End Date')}
          value={endDate}
          onChange={setEndDate}
        />
        <LabeledField htmlFor={valueId} label={t('Initial Capital')}>
          <AffixInput
            id={valueId}
            type="number"
            prefix="$"
            className="font-mono tabular-nums"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </LabeledField>
        <SelectField
          id={`${idPrefix}-rebalance`}
          label={t('Rebalancing Frequency')}
          value={rebalanceFrequency}
          onChange={(v) => setRebalanceFrequency(v as RebalanceFrequency)}
          options={REBALANCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
      </div>
    </ParamSection>
  );
}
