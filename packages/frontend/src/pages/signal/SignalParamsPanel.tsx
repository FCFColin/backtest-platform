import { useId } from 'react';
import type { ReactNode } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
export const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;
interface TickerFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
export function TickerField({ value, onChange, placeholder }: TickerFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t('signal.common.tickerLabel')}</FieldLabel>
      <Input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t('signal.common.tickerPlaceholder')} />
    </Field>
  );
}
interface DateRangeFieldsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
}
export function DateRangeFields({ startDate, endDate, onStartDateChange, onEndDateChange }: DateRangeFieldsProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field>
        <FieldLabel htmlFor={startId}>{t('signal.common.startDate')}</FieldLabel>
        <Input id={startId} type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={endId}>{t('signal.common.endDate')}</FieldLabel>
        <Input id={endId} type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
      </Field>
    </div>
  );
}
interface RunAnalysisButtonProps {
  isLoading: boolean;
  onClick: () => void;
  text?: string;
  loadingText?: string;
  icon?: ReactNode;
}
export function RunAnalysisButton({ isLoading, onClick, text, loadingText, icon = <Play className="size-4" /> }: RunAnalysisButtonProps) {
  const { t } = useTranslation();
  return (
    <Button variant="primary" onClick={onClick} disabled={isLoading} className="w-full sm:w-auto">
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText ?? t('signal.common.analyzing')}
        </>
      ) : (
        <>
          {icon}
          {text ?? t('signal.common.startAnalysis')}
        </>
      )}
    </Button>
  );
}
