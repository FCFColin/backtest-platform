import { Play } from 'lucide-react';
import type { SignalType } from '@backtest/shared/types/signal';
import type { SignalParamsPanelProps } from './types.js';
import { INDICATORS, SIGNAL_TYPES } from './types.js';
import LoadingButton from '../LoadingButton';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';

function IndicatorConfigSection({
  ticker,
  setTicker,
  indicator,
  setIndicator,
  period,
  setPeriod,
  threshold,
  setThreshold,
}: Pick<
  SignalParamsPanelProps,
  'ticker' | 'setTicker' | 'indicator' | 'setIndicator' | 'period' | 'setPeriod' | 'threshold' | 'setThreshold'
>) {
  return (
    <ParamsSection title="标的与指标" info="选择标的与技术指标，根据指标交叉/突破生成买卖信号">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">标的代码</span>
        <input
          type="text"
          className="param-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="如 SPY"
        />
      </div>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">技术指标</span>
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
          <span className="param-label">周期</span>
          <input
            type="number"
            className="param-input"
            value={period}
            min={2}
            onChange={(e) => setPeriod(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">阈值</span>
          <input
            type="number"
            className="param-input"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
        阈值含义：RSI 为超卖阈值；Bollinger 为标准差倍数；SMA/EMA/MACD 不使用。
      </div>
    </ParamsSection>
  );
}

function SignalConfigSection({
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: Pick<
  SignalParamsPanelProps,
  'signalType' | 'setSignalType' | 'startDate' | 'setStartDate' | 'endDate' | 'setEndDate'
>) {
  return (
    <ParamsSection title="信号配置">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">信号类型</span>
        <select
          className="param-input"
          value={signalType}
          onChange={(e) => setSignalType(e.target.value as SignalType)}
        >
          {SIGNAL_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
    </ParamsSection>
  );
}

function SignalParamsPanel({
  ticker,
  setTicker,
  indicator,
  setIndicator,
  period,
  setPeriod,
  threshold,
  setThreshold,
  signalType,
  setSignalType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  isLoading,
  runAnalysis,
}: SignalParamsPanelProps) {
  return (
    <ParamsPanel>
      <IndicatorConfigSection
        ticker={ticker}
        setTicker={setTicker}
        indicator={indicator}
        setIndicator={setIndicator}
        period={period}
        setPeriod={setPeriod}
        threshold={threshold}
        setThreshold={setThreshold}
      />
      <SignalConfigSection
        signalType={signalType}
        setSignalType={setSignalType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />
      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runAnalysis} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

export default SignalParamsPanel;
