import { memo, useState, type ChangeEvent, type ReactNode } from 'react';
import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Calendar } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
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
interface FloatingLabelInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
  containerClassName?: string;
}
export const FloatingLabelInput = forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ label, prefix, suffix, error, hint, className, containerClassName, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            'relative h-14 rounded-md border transition-colors duration-150 bg-input-bg',
            error
              ? 'border-danger focus-within:border-danger'
              : 'border-border focus-within:border-brand',
            'group',
          )}
        >
          <label
            htmlFor={inputId}
            className={cn(
              'absolute left-3 top-1.5 z-10 pointer-events-none',
              'text-label-tiny text-fg-tertiary',
              'transition-colors duration-150',
              'group-focus-within:text-brand',
            )}
          >
            {label}
          </label>
          {prefix && (
            <span className="absolute left-3 bottom-2 text-body text-fg-tertiary pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-full pt-6 pb-2 bg-transparent',
              'text-body text-fg font-mono tabular-nums',
              'focus:outline-none placeholder:text-fg-tertiary',
              prefix ? 'pl-7' : 'pl-3',
              suffix ? 'pr-16' : 'pr-3',
              className,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 bottom-2 text-caption text-fg-tertiary pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
      </div>
    );
  },
);
FloatingLabelInput.displayName = 'FloatingLabelInput';
interface FloatingLabelDateProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}
export const FloatingLabelDate = forwardRef<HTMLInputElement, FloatingLabelDateProps>(
  ({ label, error, hint, className, containerClassName, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            'relative h-14 rounded-md border transition-colors duration-150 bg-input-bg',
            error
              ? 'border-danger focus-within:border-danger'
              : 'border-border focus-within:border-brand',
            'group',
          )}
        >
          <label
            htmlFor={inputId}
            className={cn(
              'absolute left-3 top-1.5 z-10 pointer-events-none',
              'text-label-tiny text-fg-tertiary',
              'transition-colors duration-150',
              'group-focus-within:text-brand',
            )}
          >
            {label}
          </label>
          <input
            ref={ref}
            id={inputId}
            type="date"
            className={cn(
              'w-full h-full pt-6 pb-2 pl-3 pr-10 bg-transparent',
              'text-body text-fg font-mono tabular-nums',
              'focus:outline-none',
              className,
            )}
            {...props}
          />
          <Calendar className="absolute right-3 bottom-2 h-4 w-4 text-fg-tertiary pointer-events-none" />
        </div>
        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
      </div>
    );
  },
);
FloatingLabelDate.displayName = 'FloatingLabelDate';
interface FloatingLabelSelectProps {
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  hint?: string;
  placeholder?: string;
  containerClassName?: string;
  disabled?: boolean;
}
export const FloatingLabelSelect = forwardRef<HTMLButtonElement, FloatingLabelSelectProps>(
  (
    {
      label,
      value,
      onValueChange,
      options,
      error,
      hint,
      placeholder,
      containerClassName,
      disabled,
    },
    ref,
  ) => {
    const inputId = useId();
    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            'relative h-14 rounded-md border transition-colors duration-150',
            'bg-input-bg',
            error ? 'border-danger' : 'border-border hover:border-border-strong',
            'group',
          )}
        >
          <label
            htmlFor={inputId}
            className="absolute left-3 top-1.5 z-10 pointer-events-none text-label-tiny text-fg-tertiary"
          >
            {label}
          </label>
          <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger
              ref={ref}
              id={inputId}
              className={cn(
                'w-full h-full pt-6 pb-2 px-3 pr-9',
                'flex items-center justify-between',
                'text-body text-fg text-left',
                'border-0 bg-transparent focus:outline-none focus:ring-0',
                '[&>svg]:absolute [&>svg]:right-3 [&>svg]:bottom-3.5 [&>svg]:opacity-100',
              )}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
      </div>
    );
  },
);
FloatingLabelSelect.displayName = 'FloatingLabelSelect';
export interface TFunctionProp {
  t: TFunction;
}
function validateDateChange(
  field: 'startDate' | 'endDate',
  value: string,
  otherDate: string,
  t: TFunction,
): string | null {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (field === 'endDate' && value > today) return t('params.endDateAfterToday');
  if (field === 'startDate' && otherDate && value > otherDate) return t('params.startDateAfterEnd');
  if (field === 'endDate' && otherDate && value < otherDate) return t('params.endDateBeforeStart');
  return null;
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
const selectClassName =
  'flex h-10 w-full rounded-md border border-border bg-input-bg px-3 py-2 text-body text-fg transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50';
export function BasicParamsRow({
  startDate,
  endDate,
  startingValue,
  baseCurrency,
  adjustForInflation,
  onChange,
}: BasicParamsRowProps) {
  const { t } = useTranslation();
  const prefix = baseCurrency === 'usd' ? '$' : '¥';
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-start-date">{t('params.startDate')}</FieldLabel>
        <Input
          id="bp-start-date"
          type="date"
          value={startDate}
          onChange={(e) => onChange('startDate', e.target.value)}
        />
      </Field>
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-end-date">{t('params.endDate')}</FieldLabel>
        <Input
          id="bp-end-date"
          type="date"
          value={endDate}
          onChange={(e) => onChange('endDate', e.target.value)}
        />
      </Field>
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-start-val">{t('params.startingValue')}</FieldLabel>
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
        <FieldLabel htmlFor="bp-currency">{t('params.currency')}</FieldLabel>
        <select
          id="bp-currency"
          className={selectClassName}
          value={baseCurrency}
          onChange={(e) => onChange('baseCurrency', e.target.value as 'usd' | 'cny')}
        >
          <option value="usd">USD ($)</option>
          <option value="cny">CNY (¥)</option>
        </select>
      </Field>
      <div className="flex h-10 items-center gap-2">
        <Switch
          checked={adjustForInflation}
          onCheckedChange={(v) => onChange('adjustForInflation', v)}
        />
        <span className="text-caption text-fg-secondary">{t('params.inflationAdjust')}</span>
      </div>
    </div>
  );
}
function useParamField() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return { t, parameters, updateParameter };
}
function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean | undefined;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Switch checked={checked ?? false} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div className="flex-1">
        <div className="text-body text-fg">{label}</div>
        {description && <div className="text-caption text-fg-tertiary mt-0.5">{description}</div>}
      </div>
    </div>
  );
}
const CURRENCY_OPTIONS = [
  { value: 'usd', label: 'USD ($)' },
  { value: 'cny', label: 'CNY (¥)' },
];

function BasicParamsGrid() {
  const { t, parameters, updateParameter } = useParamField();
  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';
  const handleDateRangeChange = (value: string) => {
    updateParameter('startDate', value === 'all' ? '' : DEFAULT_BACKTEST_START_DATE);
    updateParameter('endDate', value === 'all' ? '' : DEFAULT_END_DATE);
  };
  const handleDateChange = (field: 'startDate' | 'endDate', e: ChangeEvent<HTMLInputElement>) => {
    const err = validateDateChange(
      field,
      e.target.value,
      field === 'startDate' ? parameters.endDate : parameters.startDate,
      t,
    );
    if (err) {
      useToastStore.getState().addToast('warning', err);
      return;
    }
    updateParameter(field, e.target.value);
  };
  const handleNum = (
    key: 'startingValue' | 'rollingWindowMonths',
    e: ChangeEvent<HTMLInputElement>,
  ) => updateParameter(key, Math.max(1, Number(e.target.value) || 0));
  const dateFields = [
    {
      field: 'startDate',
      label: t('params.startDate'),
      value: parameters.startDate || DEFAULT_BACKTEST_START_DATE,
    },
    { field: 'endDate', label: t('params.endDate'), value: parameters.endDate || DEFAULT_END_DATE },
  ] as const;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {dateFields.map((f) => (
        <FloatingLabelDate
          key={f.field}
          label={f.label}
          value={f.value}
          disabled={dateRangeMode === 'all'}
          onChange={(e) => handleDateChange(f.field, e)}
        />
      ))}
      <FloatingLabelInput
        label={t('params.startingValue')}
        type="number"
        value={parameters.startingValue}
        min={1}
        step="any"
        onChange={(e) => handleNum('startingValue', e)}
        prefix={parameters.baseCurrency === 'usd' ? '$' : '¥'}
      />
      <FloatingLabelInput
        label={t('params.rollingWindow')}
        type="number"
        value={parameters.rollingWindowMonths}
        min={1}
        max={120}
        step={1}
        onChange={(e) => handleNum('rollingWindowMonths', e)}
        suffix={t('params.months')}
      />
      <FloatingLabelSelect
        label={t('params.dateRange')}
        value={dateRangeMode}
        onValueChange={handleDateRangeChange}
        options={[
          { value: 'all', label: t('params.allHistory') },
          { value: 'custom', label: t('params.customRange') },
        ]}
      />
      <FloatingLabelSelect
        label={t('params.currency')}
        value={parameters.baseCurrency}
        onValueChange={(v) => updateParameter('baseCurrency', v as 'usd' | 'cny')}
        options={CURRENCY_OPTIONS}
      />
    </div>
  );
}
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
        {t('params.advanced')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
          <SwitchRow
            label={t('params.adjustForInflation')}
            checked={parameters.adjustForInflation}
            onCheckedChange={(v) => updateParameter('adjustForInflation', v)}
          />
          <SwitchRow
            label={t('params.extendedWithdrawalStats')}
            checked={parameters.extendedWithdrawalStats}
            onCheckedChange={(v) => updateParameter('extendedWithdrawalStats', v)}
          />
          <div className="flex items-start gap-3 py-2">
            <Switch
              checked={benchmarkEnabled}
              onCheckedChange={(v) => updateParameter('benchmarkTicker', v ? 'SPY' : '')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-body text-fg">{t('params.pickBenchmarkTicker')}</div>
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
