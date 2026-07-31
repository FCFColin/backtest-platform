import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalType } from '@backtest/shared/types/signal';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { INDICATORS, RunAnalysisButton } from './SignalParamsPanel.js';
import type { UseSignalAnalyzerStateResult } from './useSignalAnalyzerState.js';
const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: 'signal.analyzer.signalTypeEntry' },
  { value: 'exit', label: 'signal.analyzer.signalTypeExit' },
  { value: 'both', label: 'signal.analyzer.signalTypeBoth' }
];
function IndicatorConfigSection({ state }: { state: UseSignalAnalyzerStateResult }) {
  const { t } = useTranslation();
  const { ticker, setTicker, indicator, setIndicator, period, setPeriod, threshold, setThreshold } = state;
  const tickerId = useId();
  const indId = useId();
  const periodId = useId();
  const thrId = useId();
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-h3 text-fg">{t('signal.analyzer.indicatorSection')}</h3>
        <FieldDescription>{t('signal.analyzer.indicatorSectionInfo')}</FieldDescription>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor={tickerId}>{t('signal.common.tickerLabel')}</FieldLabel>
          <Input id={tickerId} type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder={t('signal.common.tickerPlaceholder')} />
        </Field>
        <Field>
          <FieldLabel htmlFor={indId}>{t('signal.analyzer.indicator')}</FieldLabel>
          <Select value={indicator} onValueChange={setIndicator}>
            <SelectTrigger id={indId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDICATORS.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={periodId}>{t('signal.analyzer.period')}</FieldLabel>
          <Input id={periodId} type="number" className="font-mono tabular-nums" value={period} min={2} onChange={(e) => setPeriod(Number(e.target.value))} />
        </Field>
        <Field>
          <FieldLabel htmlFor={thrId}>{t('signal.analyzer.threshold')}</FieldLabel>
          <Input id={thrId} type="number" className="font-mono tabular-nums" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </Field>
      </div>
      <FieldDescription>{t('signal.analyzer.thresholdHint')}</FieldDescription>
    </section>
  );
}
function SignalConfigSection({ state }: { state: UseSignalAnalyzerStateResult }) {
  const { t } = useTranslation();
  const { signalType, setSignalType, startDate, setStartDate, endDate, setEndDate } = state;
  const typeId = useId();
  const startId = useId();
  const endId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h3 text-fg">{t('signal.analyzer.signalConfigSection')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={typeId}>{t('signal.analyzer.signalType')}</FieldLabel>
          <Select value={signalType} onValueChange={(v) => setSignalType(v as SignalType)}>
            <SelectTrigger id={typeId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGNAL_TYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={startId}>{t('signal.common.startDate')}</FieldLabel>
          <Input id={startId} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('signal.common.endDate')}</FieldLabel>
          <Input id={endId} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
    </section>
  );
}
export function SignalAnalyzerParamsPanel({ state }: { state: UseSignalAnalyzerStateResult }) {
  const { isLoading, runAnalysis } = state;
  return (
    <div className="flex flex-col gap-5">
      <IndicatorConfigSection state={state} />
      <SignalConfigSection state={state} />
      <RunAnalysisButton isLoading={isLoading} onClick={runAnalysis} />
    </div>
  );
}
