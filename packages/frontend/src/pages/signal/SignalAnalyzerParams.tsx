/**
 * @file 单信号分析参数面板子组件
 * @description 承载指标配置（标的/指标/周期/阈值）与信号配置（信号类型/日期范围）。
 *   基于 shadcn Select / Input + Field 包装，遵循 testfol.io 风格。
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalType } from '@backtest/shared/types/signal';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { INDICATORS, RunAnalysisButton } from './SignalParamsPanel.js';

/** 信号类型选项（label 为 i18n key） */
const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: 'signal.analyzer.signalTypeEntry' },
  { value: 'exit', label: 'signal.analyzer.signalTypeExit' },
  { value: 'both', label: 'signal.analyzer.signalTypeBoth' },
];

/** 单信号分析参数面板 Props */
interface SignalAnalyzerParamsProps {
  ticker: string;
  setTicker: (v: string) => void;
  indicator: string;
  setIndicator: (v: string) => void;
  period: number;
  setPeriod: (v: number) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  signalType: SignalType;
  setSignalType: (v: SignalType) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}

/** 指标配置 section Props */
type IndicatorProps = Pick<
  SignalAnalyzerParamsProps,
  | 'ticker'
  | 'setTicker'
  | 'indicator'
  | 'setIndicator'
  | 'period'
  | 'setPeriod'
  | 'threshold'
  | 'setThreshold'
>;

/**
 * 指标配置 section：标的 / 指标 / 周期 / 阈值，四列响应式 grid。
 * @param props - 见 IndicatorProps
 * @returns 渲染的指标配置 section
 */
function IndicatorConfigSection({
  ticker,
  setTicker,
  indicator,
  setIndicator,
  period,
  setPeriod,
  threshold,
  setThreshold,
}: IndicatorProps) {
  const { t } = useTranslation();
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
          <Input
            id={tickerId}
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t('signal.common.tickerPlaceholder')}
          />
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
          <Input
            id={periodId}
            type="number"
            className="font-mono tabular-nums"
            value={period}
            min={2}
            onChange={(e) => setPeriod(Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={thrId}>{t('signal.analyzer.threshold')}</FieldLabel>
          <Input
            id={thrId}
            type="number"
            className="font-mono tabular-nums"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </Field>
      </div>
      <FieldDescription>{t('signal.analyzer.thresholdHint')}</FieldDescription>
    </section>
  );
}

/** 信号配置 section Props */
type SignalConfigProps = Pick<
  SignalAnalyzerParamsProps,
  'signalType' | 'setSignalType' | 'startDate' | 'setStartDate' | 'endDate' | 'setEndDate'
>;

/**
 * 信号配置 section：信号类型 / 开始日期 / 结束日期，三列响应式 grid。
 * @param props - 见 SignalConfigProps
 * @returns 渲染的信号配置 section
 */
function SignalConfigSection({
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: SignalConfigProps) {
  const { t } = useTranslation();
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
          <Input
            id={startId}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('signal.common.endDate')}</FieldLabel>
          <Input
            id={endId}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}

/**
 * 单信号分析参数面板（指标配置 + 信号配置 + 运行按钮）。
 * @param props - 见 SignalAnalyzerParamsProps
 * @returns 渲染的参数面板
 */
export function SignalAnalyzerParamsPanel(props: SignalAnalyzerParamsProps) {
  return (
    <div className="flex flex-col gap-5">
      <IndicatorConfigSection
        ticker={props.ticker}
        setTicker={props.setTicker}
        indicator={props.indicator}
        setIndicator={props.setIndicator}
        period={props.period}
        setPeriod={props.setPeriod}
        threshold={props.threshold}
        setThreshold={props.setThreshold}
      />
      <SignalConfigSection
        signalType={props.signalType}
        setSignalType={props.setSignalType}
        startDate={props.startDate}
        setStartDate={props.setStartDate}
        endDate={props.endDate}
        setEndDate={props.setEndDate}
      />
      <RunAnalysisButton isLoading={props.isLoading} onClick={props.runAnalysis} />
    </div>
  );
}
