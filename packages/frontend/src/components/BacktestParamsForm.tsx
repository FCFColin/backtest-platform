import { memo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import {
  Switch,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Card,
  Input,
} from '@/components/ui/uiComponents';
import { FloatingLabelInput } from '@/components/form/FloatingLabelInput.js';
import { FloatingLabelSelect } from '@/components/form/FloatingLabelSelect.js';
import { FloatingLabelDate } from '@/components/form/FloatingLabelDate.js';
import { Field, FieldLabel } from '@/components/form/Field';
import TickerInput from './TickerInput.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';
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
interface ParamsSectionProps {
  title?: string;
  info?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  plain?: boolean;
}
export function ParamsSection({
  title,
  info,
  children,
  defaultOpen = true,
  plain = false,
}: ParamsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn(!plain && 'border-b border-border-subtle')}>
      {title && (
        <div
          className="flex items-center justify-between cursor-pointer py-2 px-2 select-none"
          onClick={() => setOpen(!open)}
        >
          <div className="flex items-center gap-1.5">
            {open ? (
              <ChevronDown className="size-3.5 text-fg-tertiary" />
            ) : (
              <ChevronRight className="size-3.5 text-fg-tertiary" />
            )}
            <span
              className={cn(
                plain
                  ? 'text-label font-medium text-fg-tertiary'
                  : 'text-body font-semibold text-fg',
              )}
            >
              {title}
            </span>
          </div>
          {info && (
            <div className="relative inline-flex group" onClick={(e) => e.stopPropagation()}>
              <Info className="size-3.5 cursor-help text-fg-tertiary" />
              <div className="absolute right-0 top-6 hidden group-hover:block z-10 w-60 rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
                {info}
              </div>
            </div>
          )}
        </div>
      )}
      {open && <div className={cn('px-2', plain ? 'pb-2' : 'pb-4')}>{children}</div>}
    </div>
  );
}
export function ParamsPanel({ children }: { children: ReactNode }) {
  return <Card className="flex flex-col p-2">{children}</Card>;
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
