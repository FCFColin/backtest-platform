import {
  memo,
  useState,
  useEffect,
  type ChangeEvent,
  type ReactNode,
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useToastStore } from '@/store/toastStore';
import {
  Switch,
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
import TickerInput from './TickerInput.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';

export interface TFunctionProp {
  t: TFunction;
}

const FIELD_SHELL =
  'relative h-14 rounded-md border transition-colors duration-150 bg-input-bg group';
const LABEL_CLS =
  'absolute left-3 top-1.5 z-10 pointer-events-none text-label-tiny text-fg-tertiary transition-colors duration-150 group-focus-within:text-brand';

interface FloatingFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerClassName?: string;
  type?: 'select' | string;
  options?: Array<{ value: string; label: string }>;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}
export const FloatingField = forwardRef<HTMLInputElement, FloatingFieldProps>(
  (
    {
      label,
      prefix,
      suffix,
      className,
      containerClassName,
      id,
      type = 'text',
      options,
      onValueChange,
      disabled,
      ...props
    },
    ref,
  ) => {
    const fallbackId = useId();
    const inputId = id ?? fallbackId;
    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            FIELD_SHELL,
            'border-border focus-within:border-brand hover:border-border-strong',
          )}
        >
          <label htmlFor={inputId} className={LABEL_CLS}>
            {label}
          </label>
          <FieldControl
            inputId={inputId}
            inputRef={ref}
            label={label}
            options={options}
            onValueChange={onValueChange}
            disabled={disabled}
            prefix={prefix}
            suffix={suffix}
            className={className}
            type={type}
            {...props}
          />
        </div>
      </div>
    );
  },
);
FloatingField.displayName = 'FloatingField';
type FieldControlProps = Omit<FloatingFieldProps, 'containerClassName' | 'id'> & {
  inputId: string;
  inputRef: Ref<HTMLInputElement>;
};

function FieldControl({
  inputId,
  inputRef,
  label,
  options,
  onValueChange,
  disabled,
  prefix,
  suffix,
  className,
  type,
  ...inputProps
}: FieldControlProps) {
  if (type === 'select') {
    return (
      <Select value={inputProps.value as string} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={inputId}
          aria-label={label}
          className="w-full h-full pt-6 pb-2 px-3 pr-9 flex items-center justify-between text-body text-fg text-left border-0 bg-transparent focus:outline-none focus:ring-0 [&>svg]:absolute [&>svg]:right-3 [&>svg]:bottom-3.5 [&>svg]:opacity-100"
        >
          <SelectValue placeholder={inputProps.placeholder as string} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          {options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <>
      {prefix && (
        <span className="absolute left-3 bottom-2 text-body text-fg-tertiary pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type={type}
        disabled={disabled}
        className={cn(
          'w-full h-full pt-6 pb-2 bg-transparent text-body text-fg font-mono tabular-nums focus:outline-none placeholder:text-fg-tertiary',
          prefix ? 'pl-7' : 'pl-3',
          suffix ? 'pr-16' : 'pr-3',
          className,
        )}
        {...inputProps}
      />
      {suffix && (
        <span className="absolute right-3 bottom-2 text-caption text-fg-tertiary pointer-events-none">
          {suffix}
        </span>
      )}
    </>
  );
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
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-fg-tertiary">
            {prefix}
          </span>
          <Input
            id="bp-start-val"
            type="number"
            className="pl-7"
            value={startingValue}
            onChange={(e) => onChange('startingValue', Number(e.target.value))}
          />
        </div>
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
  const handleDateChange = (field: 'startDate' | 'endDate', e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
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
  } = useParamField();
  const dateFields = [
    ['startDate', t('Start Date'), parameters.startDate || DEFAULT_BACKTEST_START_DATE],
    ['endDate', t('End Date'), parameters.endDate || DEFAULT_END_DATE],
  ] as const;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {dateFields.map(([field, label, value]) => (
        <FloatingField
          key={field}
          label={label}
          type="date"
          value={value}
          disabled={dateRangeMode === 'all'}
          onChange={(e) => handleDateChange(field, e)}
        />
      ))}
      <FloatingField
        label={t('Starting Value')}
        type="number"
        value={parameters.startingValue}
        min={1}
        step="any"
        onChange={(e) => handleNum('startingValue', e)}
        prefix={parameters.baseCurrency === 'usd' ? '$' : '¥'}
      />
      <FloatingField
        label={t('Rolling Window')}
        type="number"
        value={parameters.rollingWindowMonths}
        min={1}
        max={120}
        step={1}
        onChange={(e) => handleNum('rollingWindowMonths', e)}
        suffix={t('months')}
      />
      <FloatingField
        label={t('Date Range')}
        type="select"
        value={dateRangeMode}
        onValueChange={handleDateRangeChange}
        options={[
          { value: 'all', label: t('All History') },
          { value: 'custom', label: t('Custom Range') },
        ]}
      />
      <FloatingField
        label={t('Currency')}
        type="select"
        value={currency}
        onValueChange={(v) => useSettingsStore.getState().setCurrency(v as 'usd' | 'cny')}
        options={CURRENCY_OPTIONS}
      />
    </div>
  );
}

const ADVANCED_SWITCHES: Array<{
  labelKey: string;
  paramKey: 'adjustForInflation' | 'extendedWithdrawalStats';
}> = [
  { labelKey: 'params.adjustForInflation', paramKey: 'adjustForInflation' },
  { labelKey: 'params.extendedWithdrawalStats', paramKey: 'extendedWithdrawalStats' },
];

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
