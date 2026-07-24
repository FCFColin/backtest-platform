/**
 * @file DualSignal 参数面板
 * @description 双信号配置 + 组合方式 + 股票代码 + 日期范围；从 DualSignalPage 拆分以便独立维护。
 *   基于 shadcn Select / Input + Field 包装，遵循 testfol.io 风格。
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/form/Field';
import { INDICATORS, RunAnalysisButton } from './SignalParamsPanel.js';
import type { SignalCfg } from './useDualSignalState.js';

/** 组合方式选项（label 为 i18n key） */
const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'signal.dual.combinationAnd' },
  { value: 'or', label: 'signal.dual.combinationOr' },
  { value: 'xor', label: 'signal.dual.combinationXor' },
];

/** DualSignal 参数面板 Props */
interface DualSignalParamsProps {
  cfg1: SignalCfg;
  cfg2: SignalCfg;
  combinationMethod: 'and' | 'or' | 'xor';
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onCfg1Change: (cfg: SignalCfg) => void;
  onCfg2Change: (cfg: SignalCfg) => void;
  onCombinationMethodChange: (m: 'and' | 'or' | 'xor') => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

/** 单信号配置字段 Props */
interface SignalCfgFieldsProps {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}

/**
 * 单信号配置字段：指标 / 周期 / 阈值，三列响应式 grid。
 * @param props - 见 SignalCfgFieldsProps
 * @returns 渲染的单信号配置字段组
 */
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
        <Input
          id={periodId}
          type="number"
          className="font-mono tabular-nums"
          value={cfg.period}
          min={2}
          onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={thrId}>{t('signal.dual.threshold')}</FieldLabel>
        <Input
          id={thrId}
          type="number"
          className="font-mono tabular-nums"
          value={cfg.threshold}
          onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}

/**
 * DualSignal 参数面板（信号1 + 信号2 + 组合方式 + 运行按钮）。
 * @param props - 见 DualSignalParamsProps
 * @returns 渲染的参数面板
 */
export function DualSignalParamsPanel({
  cfg1,
  cfg2,
  combinationMethod,
  ticker,
  startDate,
  endDate,
  isLoading,
  onCfg1Change,
  onCfg2Change,
  onCombinationMethodChange,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: DualSignalParamsProps) {
  const { t } = useTranslation();
  const combId = useId();
  const tickerId = useId();
  const startId = useId();
  const endId = useId();
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.signal1Config')}</h3>
        <SignalCfgFields cfg={cfg1} onChange={onCfg1Change} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.signal2Config')}</h3>
        <SignalCfgFields cfg={cfg2} onChange={onCfg2Change} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('signal.dual.combinationSection')}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor={combId}>{t('signal.dual.combinationLogic')}</FieldLabel>
            <Select
              value={combinationMethod}
              onValueChange={(v) => onCombinationMethodChange(v as 'and' | 'or' | 'xor')}
            >
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
            <Input
              id={tickerId}
              type="text"
              value={ticker}
              onChange={(e) => onTickerChange(e.target.value)}
              placeholder={t('signal.common.tickerPlaceholder')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={startId}>{t('signal.common.startDate')}</FieldLabel>
            <Input
              id={startId}
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={endId}>{t('signal.common.endDate')}</FieldLabel>
            <Input
              id={endId}
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </Field>
        </div>
      </section>
      <RunAnalysisButton isLoading={isLoading} onClick={onRun} />
    </div>
  );
}
