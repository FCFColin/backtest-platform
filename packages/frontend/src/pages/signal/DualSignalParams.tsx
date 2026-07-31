import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { INDICATORS, RunAnalysisButton } from './SignalParamsPanel.js';
import type { SignalCfg } from './useDualSignalState.js';
import type { UseDualSignalStateResult } from './useDualSignalState.js';
const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'signal.dual.combinationAnd' },
  { value: 'or', label: 'signal.dual.combinationOr' },
  { value: 'xor', label: 'signal.dual.combinationXor' }
];
interface SignalCfgFieldsProps {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}
function SignalCfgFields({ cfg, onChange }: SignalCfgFieldsProps) {
  const { t } = useTranslation();
  const indId = useId();
  const periodId = useId();
  const thrId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={indId}>{t('signal.dual.indicator')}</FieldLabel>
        <Select value={cfg.indicator} onValueChange={(v) => onChange({ ...cfg, indicator: v })}>
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
        <FieldLabel htmlFor={periodId}>{t('signal.dual.period')}</FieldLabel>
        <Input id={periodId} type="number" className="font-mono tabular-nums" value={cfg.period} min={2} onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })} />
      </Field>
      <Field>
        <FieldLabel htmlFor={thrId}>{t('signal.dual.threshold')}</FieldLabel>
        <Input id={thrId} type="number" className="font-mono tabular-nums" value={cfg.threshold} onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })} />
      </Field>
    </div>
  );
}
function CombinationAndDateFields({ state }: { state: UseDualSignalStateResult }) {
  const { t } = useTranslation();
  const { combinationMethod, ticker, startDate, endDate, setCombinationMethod, setTicker, setStartDate, setEndDate } = state;
  const combId = useId();
  const tickerId = useId();
  const startId = useId();
  const endId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel htmlFor={combId}>{t('signal.dual.combinationLogic')}</FieldLabel>
        <Select value={combinationMethod} onValueChange={(v) => setCombinationMethod(v as 'and' | 'or' | 'xor')}>
          <SelectTrigger id={combId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMBINATION_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {t(m.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={tickerId}>{t('signal.common.tickerLabel')}</FieldLabel>
        <Input id={tickerId} type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder={t('signal.common.tickerPlaceholder')} />
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
  );
}
export function DualSignalParamsPanel({ state }: { state: UseDualSignalStateResult }) {
  const { t } = useTranslation();
  const { cfg1, cfg2, isLoading, setCfg1, setCfg2, runAnalysis } = state;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.signal1Config')}</h3>
        <SignalCfgFields cfg={cfg1} onChange={setCfg1} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.signal2Config')}</h3>
        <SignalCfgFields cfg={cfg2} onChange={setCfg2} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.combinationSection')}</h3>
        <CombinationAndDateFields state={state} />
      </section>
      <RunAnalysisButton isLoading={isLoading} onClick={runAnalysis} />
    </div>
  );
}
