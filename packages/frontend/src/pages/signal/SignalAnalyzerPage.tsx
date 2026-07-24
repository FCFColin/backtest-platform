/**
 * @file 单信号分析页面
 * @description 基于技术指标（SMA/EMA/RSI/MACD/Bollinger）生成买卖信号，并展示信号列表、统计卡片与权益曲线
 * @route /signal-analyzer
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '@/components/layout/ToolPageLayout';
import { useSignalAnalyzerState } from './useSignalAnalyzerState.js';
import { SignalAnalyzerParamsPanel } from './SignalAnalyzerParams.js';
import { SignalAnalyzerResultsPanel } from './SignalAnalyzerResults.js';

/**
 * 单信号分析页面：ToolPageLayout 包参数面板 + 结果面板。
 * @returns 渲染的单信号分析页面
 */
export default function SignalAnalyzerPage() {
  const { t } = useTranslation();
  const s = useSignalAnalyzerState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('signal.analyzer.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('signal.analyzer.paramsTitle')}
        params={
          <SignalAnalyzerParamsPanel
            ticker={s.ticker}
            setTicker={s.setTicker}
            indicator={s.indicator}
            setIndicator={s.setIndicator}
            period={s.period}
            setPeriod={s.setPeriod}
            threshold={s.threshold}
            setThreshold={s.setThreshold}
            signalType={s.signalType}
            setSignalType={s.setSignalType}
            startDate={s.startDate}
            setStartDate={s.setStartDate}
            endDate={s.endDate}
            setEndDate={s.setEndDate}
            isLoading={s.isLoading}
            runAnalysis={s.runAnalysis}
          />
        }
        results={
          <SignalAnalyzerResultsPanel
            error={s.error}
            results={s.results}
            isLoading={s.isLoading}
          />
        }
      />
    </div>
  );
}
