/**
 * @file 双信号对比页面
 * @description 配置两个信号并按 AND/OR/XOR 组合，对比组合信号与单信号的统计与权益曲线
 * @route /dual-signal
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { DualSignalParamsPanel } from './DualSignalParams.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
import { useDualSignalState } from './useDualSignalState.js';

/** 双信号对比页面 */
export default function DualSignalPage() {
  const { t } = useTranslation();
  const {
    cfg1,
    cfg2,
    combinationMethod,
    ticker,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setCfg1,
    setCfg2,
    setCombinationMethod,
    setTicker,
    setStartDate,
    setEndDate,
    runAnalysis,
  } = useDualSignalState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('signal.dual.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('signal.dual.paramsTitle')}
        params={
          <DualSignalParamsPanel
            cfg1={cfg1}
            cfg2={cfg2}
            combinationMethod={combinationMethod}
            ticker={ticker}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            onCfg1Change={setCfg1}
            onCfg2Change={setCfg2}
            onCombinationMethodChange={setCombinationMethod}
            onTickerChange={setTicker}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onRun={runAnalysis}
          />
        }
        results={<DualSignalResultsPanel results={results} error={error} isLoading={isLoading} />}
      />
    </div>
  );
}
