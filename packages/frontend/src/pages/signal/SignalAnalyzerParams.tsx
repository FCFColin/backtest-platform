/**
 * @file 单信号分析参数面板子组件
 * @description 承载指标配置（标的/指标/周期/阈值）与信号配置（信号类型/日期范围）
 */
import { useTranslation } from 'react-i18next';
import type { SignalType } from '@backtest/shared/types/signal';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import {
  INDICATORS,
  TickerField,
  DateRangeFields,
  RunAnalysisButton,
} from './SignalParamsPanel.js';

/** 信号类型选项 */
const SIGNAL_TYPES: { value: SignalType; label: string }[] = [
  { value: 'entry', label: 'signal.analyzer.signalTypeEntry' },
  { value: 'exit', label: 'signal.analyzer.signalTypeExit' },
  { value: 'both', label: 'signal.analyzer.signalTypeBoth' },
];

/** 单信号分析参数面板 Props */
export interface SignalAnalyzerParamsProps {
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
  return (
    <ParamsSection
      title={t('signal.analyzer.indicatorSection')}
      info={t('signal.analyzer.indicatorSectionInfo')}
    >
      <TickerField value={ticker} onChange={setTicker} />
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">{t('signal.analyzer.indicator')}</span>
        <select
          className="param-input"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
        >
          {INDICATORS.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">{t('signal.analyzer.period')}</span>
          <input
            type="number"
            className="param-input"
            value={period}
            min={2}
            onChange={(e) => setPeriod(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">{t('signal.analyzer.threshold')}</span>
          <input
            type="number"
            className="param-input"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
        {t('signal.analyzer.thresholdHint')}
      </div>
    </ParamsSection>
  );
}

type SignalConfigProps = Pick<
  SignalAnalyzerParamsProps,
  'signalType' | 'setSignalType' | 'startDate' | 'setStartDate' | 'endDate' | 'setEndDate'
>;

function SignalConfigSection({
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: SignalConfigProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('signal.analyzer.signalConfigSection')}>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">{t('signal.analyzer.signalType')}</span>
        <select
          className="param-input"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {SIGNAL_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>
      <DateRangeFields
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
    </ParamsSection>
  );
}

/** 单信号分析参数面板（指标配置 + 信号配置 + 运行按钮） */
export function SignalAnalyzerParamsPanel(props: SignalAnalyzerParamsProps) {
  return (
    <ParamsPanel>
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
    </ParamsPanel>
  );
}
