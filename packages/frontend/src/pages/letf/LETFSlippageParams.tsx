import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface LETFParamsProps {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onLetfTickerChange: (v: string) => void;
  onBenchmarkTickerChange: (v: string) => void;
  onLeverageChange: (v: number) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}
const LEVERAGE_OPTIONS = [2, 3] as const;
interface LeverageSelectorProps {
  leverage: number;
  onChange: (v: number) => void;
}
function LeverageSelector({ leverage, onChange }: LeverageSelectorProps) {
  return (
    <div className="flex h-10 gap-1.5">
      {LEVERAGE_OPTIONS.map((lev) => {
        const active = leverage === lev;
        return (
          <button key={lev} type="button" onClick={() => onChange(lev)} className={cn('h-full rounded-md border px-5 text-body font-medium', 'transition-colors duration-150', active ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-input-bg text-fg-secondary hover:bg-hover')}>
            {lev}x
          </button>
        );
      })}
    </div>
  );
}
function LetfTickerGrid({ letfTicker, benchmarkTicker, leverage, onLetfTickerChange, onBenchmarkTickerChange, onLeverageChange }: Pick<LETFParamsProps, 'letfTicker' | 'benchmarkTicker' | 'leverage' | 'onLetfTickerChange' | 'onBenchmarkTickerChange' | 'onLeverageChange'>) {
  const { t } = useTranslation();
  const letfId = useId();
  const benchId = useId();
  const levId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={letfId}>{t('letf.etf.letfTicker')}</FieldLabel>
        <Input id={letfId} type="text" value={letfTicker} onChange={(e) => onLetfTickerChange(e.target.value)} placeholder={t('letf.etf.letfTickerPlaceholder')} />
      </Field>
      <Field>
        <FieldLabel htmlFor={benchId}>{t('letf.etf.benchmarkTicker')}</FieldLabel>
        <Input id={benchId} type="text" value={benchmarkTicker} onChange={(e) => onBenchmarkTickerChange(e.target.value)} placeholder={t('letf.etf.benchmarkTickerPlaceholder')} />
      </Field>
      <Field>
        <FieldLabel htmlFor={levId}>{t('letf.etf.leverage')}</FieldLabel>
        <LeverageSelector leverage={leverage} onChange={onLeverageChange} />
      </Field>
    </div>
  );
}
export function LETFParamsPanel({ startDate, endDate, isLoading, onStartDateChange, onEndDateChange, onRun, ...rest }: LETFParamsProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <div className="flex flex-col gap-4">
      <LetfTickerGrid {...rest} />
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={startId}>{t('letf.dateRange.startDate')}</FieldLabel>
          <Input id={startId} type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('letf.dateRange.endDate')}</FieldLabel>
          <Input id={endId} type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button variant="primary" onClick={onRun} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('letf.analyzing')}
            </>
          ) : (
            <>
              <Play className="size-4" />
              {t('letf.startAnalysis')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
