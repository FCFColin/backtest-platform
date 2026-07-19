/**
 * @file 单信号分析页面
 * @description 基于技术指标（SMA/EMA/RSI/MACD/Bollinger）生成买卖信号，并展示信号列表、统计卡片与权益曲线
 * @route /signal-analyzer
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import { useSignalAnalyzerState } from './useSignalAnalyzerState.js';
import { SignalAnalyzerParamsPanel } from './SignalAnalyzerParams.js';
import { SignalAnalyzerResultsPanel } from './SignalAnalyzerResults.js';

type State = any;

function ParamsWrapper({ state }: { state: State }) {
  return (
    <SignalAnalyzerParamsPanel
      ticker={state.ticker}
      setTicker={state.setTicker}
      indicator={state.indicator}
      setIndicator={state.setIndicator}
      period={state.period}
      setPeriod={state.setPeriod}
      threshold={state.threshold}
      setThreshold={state.setThreshold}
      signalType={state.signalType}
      setSignalType={state.setSignalType}
      startDate={state.startDate}
      setStartDate={state.setStartDate}
      endDate={state.endDate}
      setEndDate={state.setEndDate}
      isLoading={state.isLoading}
      runAnalysis={state.runAnalysis}
    />
  );
}

function ResultsWrapper({ state }: { state: State }) {
  return (
    <SignalAnalyzerResultsPanel
      error={state.error}
      results={state.results}
      isLoading={state.isLoading}
    />
  );
}

const config: ComputeToolConfig<State> = {
  titleKey: 'signal.analyzer.title',
  params: ParamsWrapper,
  results: ResultsWrapper,
};

export default function SignalAnalyzerPage() {
  const s = useSignalAnalyzerState();
  return <ComputeToolShell config={config} state={s} />;
}
