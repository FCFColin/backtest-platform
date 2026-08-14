import { memo, useState, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useToastStore } from '@/store/toastStore';
import {
  Switch,
  AffixInput,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { DateField, SelectField } from '@/components/form/sharedFields';
import TickerInput from './TickerInput.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';

export interface TFunctionProp {
  t: TFunction;
}

type BasicParamsField =
  'startDate' | 'endDate' | 'startingValue' | 'baseCurrency' | 'adjustForInflation';
interface BasicParamsRowProps {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
  onChange: (field: BasicParamsField, value: string | number | boolean) => void;
}
export function BasicParamsRow({
  startDate,
  endDate,
  startingValue,
  baseCurrency,
  adjustForInflation,
  onChange,
}: BasicParamsRowProps) {
  const { t } = useTranslation();
  const currency = useSettingsStore((s) => s.currency);
  useEffect(() => {
    if (baseCurrency !== currency) onChange('baseCurrency', currency);
  }, [currency, baseCurrency, onChange]);
  const prefix = baseCurrency === 'usd' ? '$' : '¥';
  return (
    <div className="flex flex-wrap items-end gap-3">
      {[
        {
          id: 'bp-start-date',
          lbl: t('Start Date'),
          val: startDate,
          f: 'startDate' as BasicParamsField,
        },
        { id: 'bp-end-date', lbl: t('End Date'), val: endDate, f: 'endDate' as BasicParamsField },
      ].map((d) => (
        <Field key={d.id} className="min-w-[8rem] flex-1">
          <FieldLabel htmlFor={d.id}>{d.lbl}</FieldLabel>
          <Input
            id={d.id}
            type="date"
            value={d.val}
            onChange={(e) => onChange(d.f, e.target.value)}
          />
        </Field>
      ))}
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-start-val">{t('Starting Value')}</FieldLabel>
        <AffixInput
          id="bp-start-val"
          type="number"
          prefix={prefix}
          value={startingValue}
          onChange={(e) => onChange('startingValue', Number(e.target.value))}
        />
      </Field>
      <Field className="w-28">
        <FieldLabel htmlFor="bp-currency">{t('Currency')}</FieldLabel>
        <Select
          value={baseCurrency}
          onValueChange={(v) => {
            const next = v as 'usd' | 'cny';
            onChange('baseCurrency', next);
            useSettingsStore.getState().setCurrency(next);
          }}
        >
          <SelectTrigger id="bp-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {CURRENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex h-10 items-center gap-2">
        <Switch
          checked={adjustForInflation}
          onCheckedChange={(v) => onChange('adjustForInflation', v)}
          aria-label={t('params.adjustForInflation')}
        />
        <span className="text-caption text-fg-secondary">{t('params.adjustForInflation')}</span>
      </div>
    </div>
  );
}

function useParamField() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  const currency = useSettingsStore((s) => s.currency);
  useEffect(() => {
    if (parameters.baseCurrency !== currency) updateParameter('baseCurrency', currency);
  }, [currency, parameters.baseCurrency, updateParameter]);
  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';
  const handleDateRangeChange = (value: string) => {
    updateParameter('startDate', value === 'all' ? '' : DEFAULT_BACKTEST_START_DATE);
    updateParameter('endDate', value === 'all' ? '' : DEFAULT_END_DATE);
  };
  const handleDateChange = (field: 'startDate' | 'endDate', v: string) => {
    if (!v) return void updateParameter(field, v);
    const other = field === 'startDate' ? parameters.endDate : parameters.startDate;
    const today = new Date().toLocaleDateString('en-CA');
    let err: string | null = null;
    if (field === 'endDate' && v > today) err = t('End date cannot be later than today');
    else if (field === 'startDate' && other && v > other)
      err = t('Start date cannot be later than end date');
    else if (field === 'endDate' && other && v < other)
      err = t('End date cannot be earlier than start date');
    if (err) {
      useToastStore.getState().addToast('warning', err);
      return;
    }
    updateParameter(field, v);
  };
  const handleNum = (
    key: 'startingValue' | 'rollingWindowMonths',
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const clamped =
      key === 'rollingWindowMonths'
        ? Math.min(Number(e.target.value) || 0, 120)
        : Number(e.target.value) || 0;
    updateParameter(key, Math.max(1, clamped));
  };
  return {
    t,
    parameters,
    currency,
    updateParameter,
    dateRangeMode,
    handleDateRangeChange,
    handleDateChange,
    handleNum,
  };
}

const CURRENCY_OPTIONS = [
  { value: 'usd', label: 'USD ($)' },
  { value: 'cny', label: 'CNY (¥)' },
];

function BasicParamsGrid() {
  const {
    t,
    parameters,
    currency,
    dateRangeMode,
    handleDateRangeChange,
    handleDateChange,
    handleNum,
    updateParameter,
  } = useParamField();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {(
        [
          ['startDate', t('Start Date'), DEFAULT_BACKTEST_START_DATE],
          ['endDate', t('End Date'), DEFAULT_END_DATE],
        ] as const
      ).map(([field, label, fallback]) => (
        <DateField
          key={field}
          id={`bp-${field}`}
          label={label}
          value={parameters[field]}
          fallback={fallback}
          disabled={dateRangeMode === 'all'}
          onChange={(v) => handleDateChange(field, v)}
        />
      ))}
      <Field>
        <FieldLabel htmlFor="bp-start-val">{t('Starting Value')}</FieldLabel>
        <AffixInput
          id="bp-start-val"
          type="number"
          prefix={parameters.baseCurrency === 'usd' ? '$' : '¥'}
          value={parameters.startingValue}
          min={1}
          step="any"
          onChange={(e) => handleNum('startingValue', e)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="bp-window">{t('Rolling Window')}</FieldLabel>
        <AffixInput
          id="bp-window"
          type="number"
          suffix={t('months')}
          value={parameters.rollingWindowMonths}
          min={1}
          max={120}
          step={1}
          onChange={(e) => handleNum('rollingWindowMonths', e)}
        />
      </Field>
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
      <SelectField
        id="bp-currency"
        label={t('Currency')}
        value={currency}
        onChange={(v) => {
          const next = v as 'usd' | 'cny';
          updateParameter('baseCurrency', next);
          useSettingsStore.getState().setCurrency(next);
        }}
        options={CURRENCY_OPTIONS}
      />
    </div>
  );
}

const ADVANCED_SWITCHES: Array<{
  labelKey: string;
  paramKey: 'adjustForInflation';
}> = [{ labelKey: 'params.adjustForInflation', paramKey: 'adjustForInflation' }];

function AdvancedParamsSection({
  advancedOpen,
  setAdvancedOpen,
}: {
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
}) {
  const { t, parameters, updateParameter } = useParamField();
  const benchmarkEnabled = parameters.benchmarkTicker !== '';
  return (
    <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-body text-fg-secondary hover:text-fg transition-colors">
        <ChevronDown
          className={cn('h-4 w-4 transition-transform duration-200', advancedOpen && 'rotate-180')}
        />
        {t('Advanced')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
          {ADVANCED_SWITCHES.map(({ labelKey, paramKey }) => (
            <div key={paramKey} className="flex items-start gap-3 py-2">
              <Switch
                checked={parameters[paramKey]}
                onCheckedChange={(v) => updateParameter(paramKey, v)}
                className="mt-0.5"
                aria-label={t(labelKey)}
              />
              <div className="flex-1">
                <div className="text-body text-fg">{t(labelKey)}</div>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-3 py-2">
            <Switch
              checked={benchmarkEnabled}
              onCheckedChange={(v) => updateParameter('benchmarkTicker', v ? 'SPY' : '')}
              className="mt-0.5"
              aria-label={t('Pick benchmark ticker')}
            />
            <div className="flex-1">
              <div className="text-body text-fg">{t('Pick benchmark ticker')}</div>
              {benchmarkEnabled && (
                <div className="mt-1 w-[130px]">
                  <TickerInput
                    value={parameters.benchmarkTicker}
                    onChange={(v) => updateParameter('benchmarkTicker', v)}
                    placeholder="SPY"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function BasicParamsSection() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsGrid />
      <AdvancedParamsSection advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} />
    </div>
  );
}

const BacktestParamsForm = memo(function BacktestParamsForm() {
  return (
    <>
      <BasicParamsSection />
      <CashflowLegsSection />
      <OneTimeCashflowSection />
    </>
  );
});
export default BacktestParamsForm;
