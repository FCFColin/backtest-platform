/**
 * @file 双信号对比页面
 * @description 配置两个信号并按 AND/OR/XOR 组合，对比组合信号与单信号的统计与权益曲线
 * @route /dual-signal
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DualSignalParamsPanel } from './DualSignalParams.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
import { useDualSignalState } from './useDualSignalState.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

type DualSignalState = any;

function DualSignalParamsWrapper({ state }: { state: DualSignalState }) {
  return (
    <DualSignalParamsPanel
      cfg1={state.cfg1}
      cfg2={state.cfg2}
      combinationMethod={state.combinationMethod}
      ticker={state.ticker}
      startDate={state.startDate}
      endDate={state.endDate}
      isLoading={state.isLoading}
      onCfg1Change={state.setCfg1}
      onCfg2Change={state.setCfg2}
      onCombinationMethodChange={state.setCombinationMethod}
      onTickerChange={state.setTicker}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onRun={state.runAnalysis}
    />
  );
}

function DualSignalResultsWrapper({ state }: { state: DualSignalState }) {
  return (
    <DualSignalResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
    />
  );
}

const config: ComputeToolConfig<DualSignalState> = {
  titleKey: 'signal.dual.title',
  params: DualSignalParamsWrapper,
  results: DualSignalResultsWrapper,
};

/** 双信号对比页面 */
export default function DualSignalPage() {
  const s = useDualSignalState();
  return <ComputeToolShell config={config} state={s} />;
}
