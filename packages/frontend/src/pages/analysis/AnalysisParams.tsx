import { useTranslation } from 'react-i18next';
import { AffixInput } from '@/components/ui/uiComponents.js';
import { Field } from '@/components/form/Field';
import { buttonVariants } from '@/components/ui/uiComponents';
import {
  LabeledField,
  SwitchField,
  DollarInput,
  RunButton,
  DateField,
} from '@/components/form/sharedFields';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import { AllHistoryCheckbox, useEmptyRowTagChange } from '@/components/params/toolFields.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';

interface AnalysisParamsPanelProps {
  tickers: string[];
  setTickers: (v: string[]) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  rollingWindow: number;
  setRollingWindow: (v: number) => void;
  correlationWindow: number;
  setCorrelationWindow: (v: number) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}

function MonthWindowField({
  id,
  label,
  value,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  t: TFunction;
}) {
  return (
    <LabeledField htmlFor={id} label={label}>
      <AffixInput
        id={id}
        type="number"
        className="pr-14"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        suffix={t('months')}
      />
    </LabeledField>
  );
}

export function AnalysisParamsPanel(props: AnalysisParamsPanelProps) {
  const { t } = useTranslation();
  const allHistory = props.startDate === '' && props.endDate === '';
  const handleTagChange = useEmptyRowTagChange(props.tickers, props.setTickers);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
      <Field className="sm:col-span-2 lg:col-span-3">
        <TickerTagInput
          tickers={props.tickers.filter(Boolean)}
          onChange={handleTagChange}
          minCount={1}
          placeholder={t('Enter symbol, e.g. SPY')}
        />
      </Field>
      <AllHistoryCheckbox
        startDate={props.startDate}
        endDate={props.endDate}
        onStartDateChange={props.setStartDate}
        onEndDateChange={props.setEndDate}
        label={t('All History')}
      />
      <DateField
        id="analysis-start-date"
        label={t('Start Date')}
        value={props.startDate}
        fallback={DEFAULT_BACKTEST_START_DATE}
        onChange={props.setStartDate}
        disabled={allHistory}
      />
      <DateField
        id="analysis-end-date"
        label={t('End Date')}
        value={props.endDate}
        fallback={DEFAULT_END_DATE}
        onChange={props.setEndDate}
        disabled={allHistory}
      />
      <LabeledField htmlFor="analysis-starting-value" label={t('Starting Value')}>
        <DollarInput
          id="analysis-starting-value"
          type="number"
          value={props.startingValue}
          onChange={(e) => props.setStartingValue(Number(e.target.value))}
        />
      </LabeledField>
      <MonthWindowField
        id="analysis-rolling-window"
        label={t('Rolling Window')}
        value={props.rollingWindow}
        onChange={props.setRollingWindow}
        t={t}
      />
      <MonthWindowField
        id="analysis-correlation-window"
        label={t('Correlation Window')}
        value={props.correlationWindow}
        onChange={props.setCorrelationWindow}
        t={t}
      />
      <SwitchField
        id="analysis-adjust-inflation"
        label={t('Adjust for Inflation (CPI)')}
        checked={props.adjustForInflation}
        onCheckedChange={props.setAdjustForInflation}
      />
      <div className="flex justify-end sm:col-span-1 lg:col-span-2">
        <RunButton
          isLoading={props.isLoading}
          onClick={props.runAnalysis}
          label={t('Run Analysis')}
          loadingLabel={t('Analyzing...')}
          className={cn(buttonVariants({ variant: 'primary', size: 'default' }), 'w-auto')}
        />
      </div>
    </div>
  );
}
