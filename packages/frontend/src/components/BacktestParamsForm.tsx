import { memo, useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useToastStore } from '@/store/toastStore';
import { Switch, AffixInput } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { DateField, SelectField } from '@/components/form/sharedFields';
import TickerInput from './TickerInput.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import type { TFunction } from 'i18next';
import type { BacktestParameters } from '@backtest/shared';

export interface TFunctionProp {
  t: TFunction;
}

type BasicParamsField =
  | 'startDate'
  | 'endDate'
  | 'startingValue'
  | 'baseCurrency'
  | 'adjustForInflation'
  | 'rollingWindowMonths'
  | 'benchmarkTicker';

const CURRENCY_OPTIONS = [
  { value: 'usd', label: 'USD ($)' },
  { value: 'cny', label: 'CNY (¥)' },
];

interface BasicParamsFieldsProps {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
  rollingWindowMonths?: number;
  benchmarkTicker?: string;
  showRollingWindow?: boolean;
  showDateRange?: boolean;
  showBenchmark?: boolean;
  onChange: (field: BasicParamsField, value: string | number | boolean) => void;
}

function useCurrencySync(baseCurrency: string, onChange: BasicParamsFieldsProps['onChange']) {
  const currency = useSettingsStore((s) => s.currency);
  useEffect(() => {
    if (baseCurrency !== currency) onChange('baseCurrency', currency);
  }, [currency, baseCurrency, onChange]);
}

export function BasicParamsFields({
  startDate,
  endDate,
  startingValue,
  baseCurrency,
  adjustForInflation,
  rollingWindowMonths,
  benchmarkTicker = '',
  showRollingWindow = false,
  showDateRange = false,
  showBenchmark = false,
  onChange,
}: BasicParamsFieldsProps) {
  const { t } = useTranslation();
  useCurrencySync(baseCurrency, onChange);
  const dateRangeMode = startDate === '' && endDate === '' ? 'all' : 'custom';
  const [dateErrors, setDateErrors] = useState<{
    startDate?: string | null;
    endDate?: string | null;
  }>({});
  const handleDateRangeChange = (value: string) => {
    setDateErrors({});
    onChange('startDate', value === 'all' ? '' : DEFAULT_BACKTEST_START_DATE);
    onChange('endDate', value === 'all' ? '' : DEFAULT_END_DATE);
  };
  const handleDateChange = (field: 'startDate' | 'endDate', v: string) => {
    if (!v) {
      setDateErrors((e) => ({ ...e, [field]: null }));
      return void onChange(field, v);
    }
    const other = field === 'startDate' ? endDate : startDate;
    const today = new Date().toLocaleDateString('en-CA');
    let err: string | null = null;
    if (field === 'endDate' && v > today) err = t('End date cannot be later than today');
    else if (field === 'startDate' && other && v > other)
      err = t('Start date cannot be later than end date');
    else if (field === 'endDate' && other && v < other)
      err = t('End date cannot be earlier than start date');
    if (err) {
      setDateErrors((e) => ({ ...e, [field]: err }));
      useToastStore.getState().addToast('warning', err);
      return;
    }
    setDateErrors((e) => ({ ...e, [field]: null }));
    onChange(field, v);
  };
  const [numDraft, setNumDraft] = useState<{
    startingValue?: string;
    rollingWindowMonths?: string;
  }>({});
  const handleNum =
    (field: 'startingValue' | 'rollingWindowMonths') => (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setNumDraft((d) => ({ ...d, [field]: v }));
      if (v === '') return;
      const n = Number(v);
      if (Number.isNaN(n)) return;
      onChange(
        field,
        field === 'rollingWindowMonths' ? Math.min(Math.max(1, n), 120) : Math.max(1, n),
      );
    };
  const commitNum = (field: 'startingValue' | 'rollingWindowMonths') => () =>
    setNumDraft((d) => ({ ...d, [field]: undefined }));
  const prefix = baseCurrency === 'usd' ? '$' : '¥';
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DateField
          id="bp-start-date"
          label={t('Start Date')}
          value={startDate}
          fallback={DEFAULT_BACKTEST_START_DATE}
          disabled={dateRangeMode === 'all'}
          error={dateErrors.startDate}
          onChange={(v) => handleDateChange('startDate', v)}
        />
        <DateField
          id="bp-end-date"
          label={t('End Date')}
          value={endDate}
          fallback={DEFAULT_END_DATE}
          disabled={dateRangeMode === 'all'}
          error={dateErrors.endDate}
          onChange={(v) => handleDateChange('endDate', v)}
        />
        <Field>
          <FieldLabel htmlFor="bp-start-val">{t('Starting Value')}</FieldLabel>
          <AffixInput
            id="bp-start-val"
            type="number"
            prefix={prefix}
            value={numDraft.startingValue ?? String(startingValue)}
            min={1}
            step="any"
            onChange={handleNum('startingValue')}
            onBlur={commitNum('startingValue')}
          />
        </Field>
        {showRollingWindow && (
          <Field>
            <FieldLabel htmlFor="bp-window">{t('Rolling Window')}</FieldLabel>
            <AffixInput
              id="bp-window"
              type="number"
              suffix={t('months')}
              value={numDraft.rollingWindowMonths ?? rollingWindowMonths ?? ''}
              min={1}
              max={120}
              step={1}
              onChange={handleNum('rollingWindowMonths')}
              onBlur={commitNum('rollingWindowMonths')}
            />
          </Field>
        )}
        {showDateRange && (
          <SelectField
            id="bp-range"
            label={t('Date Range')}
            value={dateRangeMode}
            onChange={handleDateRangeChange}
            options={[
              { value: 'all', label: t('All History') },
              { value: 'custom', label: t('Custom Range') },
            ]}
          />
        )}
        <SelectField
          id="bp-currency"
          label={t('Currency')}
          value={baseCurrency}
          onChange={(v) => {
            const next = v as 'usd' | 'cny';
            onChange('baseCurrency', next);
            useSettingsStore.getState().setCurrency(next);
          }}
          options={CURRENCY_OPTIONS}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border-subtle">
        <div className="flex items-start gap-3 py-2">
          <Switch
            checked={adjustForInflation}
            onCheckedChange={(v) => onChange('adjustForInflation', v)}
            className="mt-0.5"
            aria-label={t('params.adjustForInflation')}
          />
          <div className="flex-1">
            <div className="text-body text-fg">{t('params.adjustForInflation')}</div>
          </div>
        </div>
        {showBenchmark && (
          <div className="flex items-start gap-3 py-2">
            <Switch
              checked={benchmarkTicker !== ''}
              onCheckedChange={(v) => onChange('benchmarkTicker', v ? 'SPY' : '')}
              className="mt-0.5"
              aria-label={t('Pick benchmark ticker')}
            />
            <div className="flex-1">
              <div className="text-body text-fg">{t('Pick benchmark ticker')}</div>
              {benchmarkTicker !== '' && (
                <div className="mt-1 w-[130px]">
                  <TickerInput
                    value={benchmarkTicker}
                    onChange={(v) => onChange('benchmarkTicker', v)}
                    placeholder="SPY"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BacktestParamsForm() {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <BasicParamsFields
        startDate={parameters.startDate}
        endDate={parameters.endDate}
        startingValue={parameters.startingValue}
        baseCurrency={parameters.baseCurrency ?? 'usd'}
        adjustForInflation={parameters.adjustForInflation}
        rollingWindowMonths={parameters.rollingWindowMonths}
        benchmarkTicker={parameters.benchmarkTicker}
        showRollingWindow
        showDateRange
        showBenchmark
        onChange={(field, value) =>
          updateParameter(field as keyof BacktestParameters, value as never)
        }
      />
      <CashflowLegsSection />
      <OneTimeCashflowSection />
    </>
  );
}

export default memo(BacktestParamsForm);
