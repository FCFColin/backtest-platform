import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { Label } from '@/components/ui/uiComponents';
import { RadioGroup, RadioGroupItem } from '@/components/ui/uiComponents';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { INDICATORS, RunAnalysisButton, TickerField } from './SignalParamsPanel.js';
import type { UseMultiSignalStateResult } from './hooks/useMultiSignalState.js';
import type { AggregationMethod, SignalItem } from './signalTypes.js';
const AGGREGATION_METHODS: { value: AggregationMethod; label: string }[] = [
  { value: 'weighted', label: 'signal.multi.aggregationWeighted' },
  { value: 'voting', label: 'signal.multi.aggregationVoting' },
  { value: 'rank', label: 'signal.multi.aggregationRank' }
];
const AGGREGATION_DESC: Record<AggregationMethod, string> = {
  weighted: 'signal.multi.descWeighted',
  voting: 'signal.multi.descVoting',
  rank: 'signal.multi.descRank'
};
const ROW_INPUT_CLS = 'h-9 w-16 font-mono tabular-nums';
function SignalRow({ signal: s, idx, weight, showWeight, canRemove, onUpdateSignal, onRemoveSignal, onUpdateWeight }: { signal: SignalItem; idx: number; weight: number; showWeight: boolean; canRemove: boolean; onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void; onRemoveSignal: (id: number) => void; onUpdateWeight: (idx: number, val: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-input-bg/50 p-3 hover:bg-hover">
      <Select value={s.indicator} onValueChange={(v) => onUpdateSignal(s.id, { indicator: v })}>
        <SelectTrigger className="h-9 w-[120px]">
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
      <Input type="number" className={ROW_INPUT_CLS} value={s.period} min={2} title={t('signal.multi.period')} onChange={(e) => onUpdateSignal(s.id, { period: Number(e.target.value) })} />
      <Input type="number" className={ROW_INPUT_CLS} value={s.threshold} title={t('signal.multi.threshold')} onChange={(e) => onUpdateSignal(s.id, { threshold: Number(e.target.value) })} />
      {showWeight && <Input type="number" step="0.1" className={`${ROW_INPUT_CLS} w-[72px]`} value={weight} title={t('signal.multi.weight')} onChange={(e) => onUpdateWeight(idx, Number(e.target.value))} />}
      {canRemove && (
        <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => onRemoveSignal(s.id)} title={t('signal.multi.delete')} aria-label={t('signal.multi.delete')}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
function SignalListSection({ state }: { state: UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const { signals, weights, aggregationMethod, addSignal, removeSignal, updateSignal, updateWeight } = state;
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-h3 text-fg">{t('signal.multi.signalList')}</h3>
        <FieldDescription>{t('signal.multi.signalListInfo')}</FieldDescription>
      </div>
      <div className="flex flex-col gap-2">
        {signals.map((s, idx) => (
          <SignalRow key={s.id} signal={s} idx={idx} weight={weights[idx] ?? 0} showWeight={aggregationMethod === 'weighted'} canRemove={signals.length > 1} onUpdateSignal={updateSignal} onRemoveSignal={removeSignal} onUpdateWeight={updateWeight} />
        ))}
      </div>
      <Button variant="secondary" size="sm" className="w-fit" onClick={addSignal}>
        <Plus className="size-4" />
        {t('signal.multi.addSignal')}
      </Button>
    </section>
  );
}
function AggregationSection({ state }: { state: UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const { aggregationMethod, setAggregationMethod } = state;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h3 text-fg">{t('signal.multi.aggregationSection')}</h3>
      <Field>
        <FieldLabel>{t('signal.multi.aggregationMethod')}</FieldLabel>
        <RadioGroup value={aggregationMethod} onValueChange={(v) => setAggregationMethod(v as AggregationMethod)} className="grid grid-cols-3 gap-3">
          {AGGREGATION_METHODS.map((m) => {
            const id = `agg-${m.value}`;
            return (
              <div key={m.value} className="flex items-center gap-2">
                <RadioGroupItem value={m.value} id={id} />
                <Label htmlFor={id}>{t(m.label)}</Label>
              </div>
            );
          })}
        </RadioGroup>
        <FieldDescription>{t(AGGREGATION_DESC[aggregationMethod])}</FieldDescription>
      </Field>
    </section>
  );
}
function BacktestParamsSection({ state }: { state: UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const { ticker, startDate, endDate, setTicker, setStartDate, setEndDate } = state;
  const startId = useId();
  const endId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h3 text-fg">{t('signal.multi.backtestParams')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TickerField value={ticker} onChange={setTicker} />
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
export function MultiSignalParamsPanel({ state }: { state: UseMultiSignalStateResult }) {
  const { isLoading, runAnalysis } = state;
  return (
    <div className="flex flex-col gap-5">
      <SignalListSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <RunAnalysisButton isLoading={isLoading} onClick={runAnalysis} />
    </div>
  );
}
