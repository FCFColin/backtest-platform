/**
 * @file 战术回测信号编辑器组件
 * @description 从 TacticalParams.tsx 拆分：CompactSelect/ParamSection 通用助手 +
 *   信号条件行、权重行、信号编辑器、信号构建分区。
 */
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useTacticalPageState,
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  createDefaultCondition,
} from './TacticalUtils';
import type {
  TradingSignal,
  SignalCondition,
} from '@backtest/shared/types/tactical';

type TacticalPageState = ReturnType<typeof useTacticalPageState>;
function CompactSelect({
  value,
  onChange,
  options,
  t,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  t: (k: string) => string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-8 text-caption', className)}>
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

/** 信号条件行：指标 + 周期 + 操作符 + 阈值 + 删除 */
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CompactSelect
        value={cond.indicator}
        onChange={(v) => onUpdate(ci, { indicator: v as SignalCondition['indicator'] })}
        options={INDICATOR_OPTIONS}
        t={t}
        className="w-[130px]"
      />
      <div className="relative">
        <Input
          type="number"
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
      />
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          {t('tactical.params.threshold')}
        </span>
        <Input
          type="number"
          step="0.01"
          className="h-8 w-[96px] pl-16 text-caption"
          value={cond.threshold}
          onChange={(e) => onUpdate(ci, { threshold: Number(e.target.value) })}
        />
      </div>
      {canRemove && (
        <Button
          variant="icon"
          size="icon"
          onClick={() => onRemove(ci)}
          title={t('tactical.params.deleteCondition')}
          className="h-7 w-7 shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** 目标权重行：标的 + 权重 + 删除 */
function WeightRow({
  weight,
  wi,
  onUpdate,
  onRemove,
  canRemove,
}: {
  weight: { ticker: string; weight: number };
  wi: number;
  onUpdate: (wi: number, patch: Partial<{ ticker: string; weight: number }>) => void;
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
          className="h-8 w-[104px] pr-6 text-caption"
          value={weight.weight}
          onChange={(e) => onUpdate(wi, { weight: Number(e.target.value) })}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          %
        </span>
      </div>
      {canRemove && (
        <Button
          variant="icon"
          size="icon"
          onClick={() => onRemove(wi)}
          title={t('tactical.params.delete')}
          className="h-7 w-7 shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** 信号编辑器内部 handlers（保留原 hook 逻辑） */
function useSignalEditorHandlers(signal: TradingSignal, onChange: (s: TradingSignal) => void) {
  const updateName = (name: string) => onChange({ ...signal, name });
  const updateCondition = (ci: number, patch: Partial<SignalCondition>) => {
    const next = signal.conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c));
    onChange({ ...signal, conditions: next });
  };
  const addCondition = () =>
    onChange({ ...signal, conditions: [...signal.conditions, createDefaultCondition()] });
  const removeCondition = (ci: number) => {
    if (signal.conditions.length <= 1) return;
    onChange({ ...signal, conditions: signal.conditions.filter((_, i) => i !== ci) });
  };
  const updateWeight = (wi: number, patch: Partial<{ ticker: string; weight: number }>) => {
    const next = signal.targetWeights.map((w, i) => (i === wi ? { ...w, ...patch } : w));
    onChange({ ...signal, targetWeights: next });
  };
  const addWeight = () =>
    onChange({ ...signal, targetWeights: [...signal.targetWeights, { ticker: '', weight: 0 }] });
  const removeWeight = (wi: number) => {
    if (signal.targetWeights.length <= 1) return;
    onChange({ ...signal, targetWeights: signal.targetWeights.filter((_, i) => i !== wi) });
  };
  return {
    updateName,
    updateCondition,
    addCondition,
    removeCondition,
    updateWeight,
    addWeight,
    removeWeight,
  };
}

/** 单个信号编辑器：名称 + 触发条件列表 + 目标权重列表 */
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
  const h = useSignalEditorHandlers(signal, onChange);
  return (
    <div className="rounded-lg border border-border bg-input-bg/30 p-3">
      <div className="mb-3 flex items-center gap-2">
        <Input
          type="text"
          className="flex-1"
          value={signal.name}
          onChange={(e) => h.updateName(e.target.value)}
          placeholder={t('tactical.params.signalNamePlaceholder', { index: index + 1 })}
        />
        {canRemove && (
          <Button
            variant="icon"
            size="icon"
            onClick={onRemove}
            title={t('tactical.params.deleteSignal')}
            className="h-8 w-8 shrink-0"
          >
            <X className="size-4" />
          </Button>
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
            onUpdate={h.updateCondition}
            onRemove={h.removeCondition}
            canRemove={signal.conditions.length > 1}
          />
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={h.addCondition} className="mt-2">
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
            onUpdate={h.updateWeight}
            onRemove={h.removeWeight}
            canRemove={signal.targetWeights.length > 1}
          />
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={h.addWeight} className="mt-2">
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
