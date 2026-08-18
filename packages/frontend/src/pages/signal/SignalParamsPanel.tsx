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
const COMBINATION_METHODS = [
  { value: 'and' as const, label: 'signal.dual.combinationAnd' },
  { value: 'or' as const, label: 'signal.dual.combinationOr' },
  { value: 'xor' as const, label: 'signal.dual.combinationXor' },
];
function SignalCfgFields({
  cfg,
  onChange,
}: {
  cfg: SignalCfg;
  onChange: (cfg: SignalCfg) => void;
}) {
  const { t } = useTranslation();
  const indId = useId();
  const periodId = useId();
  const thresholdId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <LabeledField htmlFor={indId} label={t('Technical Indicator')}>
        <IndicatorSelect
          value={cfg.indicator}
          onChange={(v) => onChange({ ...cfg, indicator: v })}
          id={indId}
        />
      </LabeledField>
      <LabeledField htmlFor={periodId} label={t('Period')}>
        <Input
          id={periodId}
          type="number"
          className="font-mono tabular-nums"
          value={cfg.period}
          min={2}
          onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })}
        />
      </LabeledField>
      <LabeledField htmlFor={thresholdId} label={t('Threshold')}>
        <Input
          id={thresholdId}
          type="number"
          className="font-mono tabular-nums"
          value={cfg.threshold}
          onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })}
        />
      </LabeledField>
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
  const tickerId = useId();
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
      <LabeledField htmlFor={tickerId} label={t('Ticker')}>
        <Input
          id={tickerId}
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder={t('e.g. SPY')}
        />
      </LabeledField>
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
      <RunButton
        isLoading={isLoading}
        onClick={runAnalysis}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
        className="w-full sm:w-auto"
      />
    </div>
  );
}
const SIGNAL_TYPES = [
  { value: 'entry' as SignalType, label: 'signal.analyzer.signalTypeEntry' },
  { value: 'exit' as SignalType, label: 'signal.analyzer.signalTypeExit' },
  { value: 'both' as SignalType, label: 'signal.analyzer.signalTypeBoth' },
];
function IndicatorConfigSection({ state }: { state: UseSignalAnalyzerStateResult }) {
  const { t } = useTranslation();
  const { ticker, setTicker, indicator, setIndicator, period, setPeriod, threshold, setThreshold } =
    state;
  const indId = useId();
  const tickerId = useId();
  const periodId = useId();
  const thresholdId = useId();
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
        <LabeledField htmlFor={tickerId} label={t('Ticker')}>
          <Input
            id={tickerId}
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t('e.g. SPY')}
          />
        </LabeledField>
        <LabeledField htmlFor={indId} label={t('Technical Indicator')}>
          <IndicatorSelect value={indicator} onChange={setIndicator} id={indId} />
        </LabeledField>
        <LabeledField htmlFor={periodId} label={t('Period')}>
          <Input
            id={periodId}
            type="number"
            className="font-mono tabular-nums"
            value={period}
            min={2}
            onChange={(e) => setPeriod(Number(e.target.value))}
          />
        </LabeledField>
        <LabeledField htmlFor={thresholdId} label={t('Threshold')}>
          <Input
            id={thresholdId}
            type="number"
            className="font-mono tabular-nums"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </LabeledField>
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
  const { t } = useTranslation();
  const { isLoading, runAnalysis } = state;
  return (
    <div className="flex flex-col gap-5">
      <IndicatorConfigSection state={state} />
      <SignalConfigSection state={state} />
      <RunButton
        isLoading={isLoading}
        onClick={runAnalysis}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
        className="w-full sm:w-auto"
      />
    </div>
  );
}
