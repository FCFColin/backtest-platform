/**
 * @file 单信号分析页面
 * @description 基于技术指标（SMA/EMA/RSI/MACD/Bollinger）生成买卖信号，并展示信号列表、统计卡片与权益曲线
 * @route /signal-analyzer
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { SignalAnalyzerParamsPanel } from './SignalAnalyzerParams.js';
import { SignalAnalyzerResultsPanel } from './SignalAnalyzerResults.js';
import { useSignalAnalyzerState } from './useSignalAnalyzerState.js';

/** 单信号分析页面 */
export default function SignalAnalyzerPage() {
  const { t } = useTranslation();
  const {
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
    error,
    results,
    runAnalysis,
  } = useSignalAnalyzerState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('signal.analyzer.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('signal.analyzer.paramsTitle')}
        params={
          <SignalAnalyzerParamsPanel
            ticker={ticker}
            setTicker={setTicker}
            indicator={indicator}
            setIndicator={setIndicator}
            period={period}
            setPeriod={setPeriod}
            threshold={threshold}
            setThreshold={setThreshold}
            signalType={signalType}
            setSignalType={setSignalType}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            isLoading={isLoading}
            runAnalysis={runAnalysis}
          />
        }
        results={
          <SignalAnalyzerResultsPanel error={error} results={results} isLoading={isLoading} />
        }
      />
    </div>
  );
}
