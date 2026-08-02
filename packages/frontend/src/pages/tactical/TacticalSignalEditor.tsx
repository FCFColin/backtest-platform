import { useTranslation } from 'react-i18next';
import { Plus, X, Info } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import {
  useTacticalPageState,
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  createDefaultCondition,
} from './TacticalUtils';
import type { TradingSignal, SignalCondition } from '@backtest/shared/types/tactical';
type TacticalPageState = ReturnType<typeof useTacticalPageState>;
type Weight = { ticker: string; weight: number };
function CompactSelect({
  value,
  onChange,
  options,
  t,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  t: (k: string) => string;
  className?: string;
  label?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label || t(options.find((o) => o.value === value)?.label || '')}
        className={cn('h-8 text-caption', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {t(o.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function ParamSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-h3 text-fg">{title}</h3>
      {children}
    </section>
  );
}
function RemoveBtn({
  onClick,
  title,
  cls = 'h-7 w-7',
  icon = 'size-3.5',
}: {
  onClick: () => void;
  title: string;
  cls?: string;
  icon?: string;
}) {
  return (
    <Button
      variant="icon"
      size="icon"
      onClick={onClick}
      title={title}
      className={cn('shrink-0', cls)}
    >
      <X className={icon} />
    </Button>
  );
}
function ConditionRow({
  cond,
  ci,
  onUpdate,
  onRemove,
  canRemove,
}: {
  cond: SignalCondition;
  ci: number;
  onUpdate: (ci: number, patch: Partial<SignalCondition>) => void;
  onRemove: (ci: number) => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  const indicatorDesc = INDICATOR_OPTIONS.find((o) => o.value === cond.indicator)?.description;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CompactSelect
        value={cond.indicator}
        onChange={(v) => onUpdate(ci, { indicator: v as SignalCondition['indicator'] })}
        options={INDICATOR_OPTIONS}
        t={t}
        className="w-[130px]"
        label={t('tactical.params.indicator')}
      />
      {indicatorDesc && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info
              className="size-3.5 shrink-0 cursor-help text-fg-tertiary"
              aria-label={t(indicatorDesc)}
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">
            {t(indicatorDesc)}
          </TooltipContent>
        </Tooltip>
      )}
      <div className="relative">
        <Input
          type="number"
          aria-label={t('tactical.params.period')}
          className="h-8 w-[88px] pr-14 text-caption"
          value={cond.period}
          onChange={(e) => onUpdate(ci, { period: Number(e.target.value) })}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          {t('tactical.params.period')}
        </span>
      </div>
      <CompactSelect
        value={cond.operator}
        onChange={(v) => onUpdate(ci, { operator: v as SignalCondition['operator'] })}
        options={OPERATOR_OPTIONS}
        t={t}
        className="w-[110px]"
        label={t('tactical.params.operator')}
      />
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          {t('tactical.params.threshold')}
        </span>
        <Input
          type="number"
          step="0.01"
          aria-label={t('tactical.params.threshold')}
          className="h-8 w-[96px] pl-16 text-caption"
          value={cond.threshold}
          onChange={(e) => onUpdate(ci, { threshold: Number(e.target.value) })}
        />
      </div>
      {canRemove && (
        <RemoveBtn onClick={() => onRemove(ci)} title={t('tactical.params.deleteCondition')} />
      )}
    </div>
  );
}
function WeightRow({
  weight,
  wi,
  onUpdate,
  onRemove,
  canRemove,
}: {
  weight: Weight;
  wi: number;
  onUpdate: (wi: number, patch: Partial<Weight>) => void;
  onRemove: (wi: number) => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        className="h-8 flex-1 text-caption uppercase"
        value={weight.ticker}
        onChange={(e) => onUpdate(wi, { ticker: e.target.value.toUpperCase() })}
        placeholder={t('tactical.params.tickerPlaceholder')}
      />
      <div className="relative">
        <Input
          type="number"
          aria-label={t('tactical.params.weight')}
          className="h-8 w-[104px] pr-6 text-caption"
          value={weight.weight}
          onChange={(e) => onUpdate(wi, { weight: Number(e.target.value) })}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          %
        </span>
      </div>
      {canRemove && <RemoveBtn onClick={() => onRemove(wi)} title={t('tactical.params.delete')} />}
    </div>
  );
}
// eslint-disable-next-line max-lines-per-function
function SignalEditor({
  signal,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  signal: TradingSignal;
  index: number;
  onChange: (signal: TradingSignal) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  const updateAt = <T,>(list: T[], idx: number, patch: Partial<T>) =>
    list.map((item, i) => (i === idx ? { ...item, ...patch } : item));
  const updateCondition = (ci: number, patch: Partial<SignalCondition>) =>
    onChange({ ...signal, conditions: updateAt(signal.conditions, ci, patch) });
  const addCondition = () =>
    onChange({ ...signal, conditions: [...signal.conditions, createDefaultCondition()] });
  const removeCondition = (ci: number) => {
    if (signal.conditions.length > 1)
      onChange({ ...signal, conditions: signal.conditions.filter((_, i) => i !== ci) });
  };
  const updateWeight = (wi: number, patch: Partial<Weight>) =>
    onChange({ ...signal, targetWeights: updateAt(signal.targetWeights, wi, patch) });
  const addWeight = () =>
    onChange({ ...signal, targetWeights: [...signal.targetWeights, { ticker: '', weight: 0 }] });
  const removeWeight = (wi: number) => {
    if (signal.targetWeights.length > 1)
      onChange({ ...signal, targetWeights: signal.targetWeights.filter((_, i) => i !== wi) });
  };
  return (
    <div className="rounded-lg border border-border bg-input-bg/30 p-3">
      <div className="mb-3 flex items-center gap-2">
        <Input
          type="text"
          className="flex-1"
          value={signal.name}
          onChange={(e) => onChange({ ...signal, name: e.target.value })}
          placeholder={t('tactical.params.signalNamePlaceholder', { index: index + 1 })}
        />
        {canRemove && (
          <RemoveBtn
            onClick={onRemove}
            title={t('tactical.params.deleteSignal')}
            cls="h-8 w-8"
            icon="size-4"
          />
        )}
      </div>
      <div className="mb-1.5 text-caption font-semibold text-fg-secondary">
        {t('tactical.params.triggerConditions')}
      </div>
      <div className="flex flex-col gap-1.5">
        {signal.conditions.map((cond, ci) => (
          <ConditionRow
            key={ci}
            cond={cond}
            ci={ci}
            onUpdate={updateCondition}
            onRemove={removeCondition}
            canRemove={signal.conditions.length > 1}
          />
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={addCondition} className="mt-2">
        <Plus className="size-3" />
        {t('tactical.params.addCondition')}
      </Button>
      <div className="mt-3 mb-1.5 text-caption font-semibold text-fg-secondary">
        {t('tactical.params.targetWeights')}
      </div>
      <div className="flex flex-col gap-1.5">
        {signal.targetWeights.map((w, wi) => (
          <WeightRow
            key={wi}
            weight={w}
            wi={wi}
            onUpdate={updateWeight}
            onRemove={removeWeight}
            canRemove={signal.targetWeights.length > 1}
          />
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={addWeight} className="mt-2">
        <Plus className="size-3" />
        {t('tactical.params.addAsset')}
      </Button>
    </div>
  );
}
export function SignalBuilderSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { strategy, updateSignal, addSignal, removeSignal } = state;
  return (
    <ParamSection title={t('tactical.params.signalBuilder')}>
      <div className="flex flex-col gap-3">
        {strategy.signals.map((sig, idx) => (
          <SignalEditor
            key={sig.id}
            signal={sig}
            index={idx}
            onChange={(s) => updateSignal(idx, s)}
            onRemove={() => removeSignal(idx)}
            canRemove={strategy.signals.length > 1}
          />
        ))}
        <Button variant="secondary" size="sm" onClick={addSignal} className="w-full justify-center">
          <Plus className="size-4" />
          {t('tactical.params.addSignal')}
        </Button>
      </div>
    </ParamSection>
  );
}
