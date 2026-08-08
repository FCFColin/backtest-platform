import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalType } from '@backtest/shared/types/signal';
import { FieldDescription } from '@/components/form/Field';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/uiComponents';
import { LabeledField, SectionHeader, RunButton, DateField } from '@/components/form/sharedFields';
import type {
  SignalCfg,
  UseDualSignalStateResult,
  UseSignalAnalyzerStateResult,
} from './signalState.js';

const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;

interface TickerFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
export function TickerField({ value, onChange, placeholder }: TickerFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <LabeledField htmlFor={id} label={t('Ticker')}>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('e.g. SPY')}
      />
    </LabeledField>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}
function NumberField({ label, value, min, onChange }: NumberFieldProps) {
  const id = useId();
  return (
    <LabeledField htmlFor={id} label={label}>
      <Input
        id={id}
        type="number"
        className="font-mono tabular-nums"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </LabeledField>
  );
}

export function IndicatorSelect({
  value,
  onChange,
  id,
  triggerClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={triggerClassName}>
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
  );
}

interface RunAnalysisButtonProps {
  isLoading: boolean;
  onClick: () => void;
  text?: string;
  loadingText?: string;
}
export function RunAnalysisButton({
  isLoading,
  onClick,
  text,
  loadingText,
}: RunAnalysisButtonProps) {
  const { t } = useTranslation();
  return (
    <RunButton
      isLoading={isLoading}
      onClick={onClick}
      label={text ?? t('Run Analysis')}
      loadingLabel={loadingText ?? t('Analyzing...')}
      className="w-full sm:w-auto"
    />
  );
}

const COMBINATION_METHODS: { value: 'and' | 'or' | 'xor'; label: string }[] = [
  { value: 'and', label: 'signal.dual.combinationAnd' },
  { value: 'or', label: 'signal.dual.combinationOr' },
  { value: 'xor', label: 'signal.dual.combinationXor' },
];

interface SignalCfgFieldsProps {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}
function SignalCfgFields({ cfg, onChange }: SignalCfgFieldsProps) {
  const { t } = useTranslation();
  const indId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <LabeledField htmlFor={indId} label={t('Technical Indicator')}>
        <IndicatorSelect
          value={cfg.indicator}
          onChange={(v) => onChange({ ...cfg, indicator: v })}
          id={indId}
        />
      </LabeledField>
      <NumberField
        label={t('Period')}
        value={cfg.period}
        min={2}
        onChange={(v) => onChange({ ...cfg, period: v })}
      />
      <NumberField
        label={t('Threshold')}
        value={cfg.threshold}
        onChange={(v) => onChange({ ...cfg, threshold: v })}
      />
    </div>
  );
}

function CombinationAndDateFields({ state }: { state: UseDualSignalStateResult }) {
  const { t } = useTranslation();
  const {
    combinationMethod,
    ticker,
    startDate,
    endDate,
    setCombinationMethod,
    setTicker,
    setStartDate,
    setEndDate,
  } = state;
  const combId = useId();
  const startId = useId();
  const endId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <LabeledField htmlFor={combId} label={t('Combination Logic')}>
        <Select
          value={combinationMethod}
          onValueChange={(v) => setCombinationMethod(v as 'and' | 'or' | 'xor')}
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
      </LabeledField>
      <TickerField value={ticker} onChange={setTicker} />
      <DateField id={startId} label={t('Start Date')} value={startDate} onChange={setStartDate} />
      <DateField id={endId} label={t('End Date')} value={endDate} onChange={setEndDate} />
    </div>
  );
}

export function DualSignalParamsPanel({ state }: { state: UseDualSignalStateResult }) {
  const { t } = useTranslation();
  const { cfg1, cfg2, isLoading, setCfg1, setCfg2, runAnalysis } = state;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionHeader title={t('Signal 1 Configuration')} variant="h3" />
        <SignalCfgFields cfg={cfg1} onChange={setCfg1} />
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader title={t('Signal 2 Configuration')} variant="h3" />
        <SignalCfgFields cfg={cfg2} onChange={setCfg2} />
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader title={t('Combination Method')} variant="h3" />
        <CombinationAndDateFields state={state} />
      </section>
      <RunAnalysisButton isLoading={isLoading} onClick={runAnalysis} />
    </div>
  );
}

const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: 'signal.analyzer.signalTypeEntry' },
  { value: 'exit', label: 'signal.analyzer.signalTypeExit' },
  { value: 'both', label: 'signal.analyzer.signalTypeBoth' },
];

function IndicatorConfigSection({ state }: { state: UseSignalAnalyzerStateResult }) {
  const { t } = useTranslation();
  const { ticker, setTicker, indicator, setIndicator, period, setPeriod, threshold, setThreshold } =
    state;
  const indId = useId();
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title={t('Ticker & Indicator')}
        info={t(
          'Select a ticker and a technical indicator; buy/sell signals are generated based on indicator crossovers/breakouts',
        )}
        variant="h3"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TickerField value={ticker} onChange={setTicker} />
        <LabeledField htmlFor={indId} label={t('Technical Indicator')}>
          <IndicatorSelect value={indicator} onChange={setIndicator} id={indId} />
        </LabeledField>
        <NumberField label={t('Period')} value={period} min={2} onChange={setPeriod} />
        <NumberField label={t('Threshold')} value={threshold} onChange={setThreshold} />
      </div>
      <FieldDescription>
        {t(
          'Threshold meaning: RSI is the oversold threshold; Bollinger is the standard-deviation multiplier; SMA/EMA/MACD do not use it.',
        )}
      </FieldDescription>
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
      <SectionHeader title={t('Signal Configuration')} variant="h3" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LabeledField htmlFor={typeId} label={t('Signal Type')}>
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
        </LabeledField>
        <DateField id={startId} label={t('Start Date')} value={startDate} onChange={setStartDate} />
        <DateField id={endId} label={t('End Date')} value={endDate} onChange={setEndDate} />
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
