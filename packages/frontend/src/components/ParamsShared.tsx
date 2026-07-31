import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/uiComponents';
import { Switch } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
type BasicParamsField = 'startDate' | 'endDate' | 'startingValue' | 'baseCurrency' | 'adjustForInflation';
interface BasicParamsRowProps {
  startDate: string;
  endDate: string;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  adjustForInflation: boolean;
  onChange: (field: BasicParamsField, value: string | number | boolean) => void;
}
const selectClassName = 'flex h-10 w-full rounded-md border border-border bg-input-bg px-3 py-2 text-body text-fg transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50';
export function BasicParamsRow({ startDate, endDate, startingValue, baseCurrency, adjustForInflation, onChange }: BasicParamsRowProps) {
  const { t } = useTranslation();
  const prefix = baseCurrency === 'usd' ? '$' : '¥';
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-start-date">{t('params.startDate')}</FieldLabel>
        <Input id="bp-start-date" type="date" value={startDate} onChange={(e) => onChange('startDate', e.target.value)} />
      </Field>
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-end-date">{t('params.endDate')}</FieldLabel>
        <Input id="bp-end-date" type="date" value={endDate} onChange={(e) => onChange('endDate', e.target.value)} />
      </Field>
      <Field className="min-w-[8rem] flex-1">
        <FieldLabel htmlFor="bp-start-val">{t('params.startingValue')}</FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-fg-tertiary">{prefix}</span>
          <Input id="bp-start-val" type="number" className="pl-7" value={startingValue} onChange={(e) => onChange('startingValue', Number(e.target.value))} />
        </div>
      </Field>
      <Field className="w-28">
        <FieldLabel htmlFor="bp-currency">{t('params.currency')}</FieldLabel>
        <select id="bp-currency" className={selectClassName} value={baseCurrency} onChange={(e) => onChange('baseCurrency', e.target.value as 'usd' | 'cny')}>
          <option value="usd">USD ($)</option>
          <option value="cny">CNY (¥)</option>
        </select>
      </Field>
      <div className="flex h-10 items-center gap-2">
        <Switch checked={adjustForInflation} onCheckedChange={(v) => onChange('adjustForInflation', v)} />
        <span className="text-caption text-fg-secondary">{t('params.inflationAdjust')}</span>
      </div>
    </div>
  );
}
