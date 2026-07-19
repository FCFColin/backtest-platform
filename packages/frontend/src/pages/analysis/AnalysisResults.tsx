/**
 * @file 资产分析结果面板与 Tab 包装组件
 * @description 承载 Tab 切换容器与 6 个 Tab 内容包装（Summary/Telltale/Correlations/Rolling/RiskReturn/Returns）
 */
import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import {
  OverviewCharts,
  TelltaleChart,
  CorrelationMatrixTable,
  BetaMatrixTable,
  RollingCorrelationChart,
  RollingMetricsChart,
  RiskReturnChart,
  AnnualReturnChart,
  MonthlyHeatmap,
} from '../../components/AnalysisCharts.js';
import { StatsTable } from '../../components/AnalysisStats.js';
import { AnalysisErrorAlert } from '@/components/resultsShell.js';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { TABS } from './analysisUtils.js';

const SummaryTab = memo(function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  return <OverviewCharts results={results} StatsTable={StatsTable} />;
});

const TelltaleTab = memo(function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  return <TelltaleChart results={results} />;
});

const CorrelationsBetaTab = memo(function CorrelationsBetaTab({
  results,
  correlationWindow,
}: {
  results: AssetAnalysisResult;
  correlationWindow: number;
}) {
  const [rollingPair, setRollingPair] = useState<[number, number]>([
    0,
    Math.min(1, results.tickers.length - 1),
  ]);
  const tickers = results.tickers.map((tk) => tk.ticker);
  const { betaMatrix, rollingCorrData } = useAnalysisData(results, correlationWindow, 12);

  return (
    <div className="space-y-6">
      <CorrelationMatrixTable tickers={results.tickers} correlations={results.correlations} />
      <BetaMatrixTable tickers={tickers} betaMatrix={betaMatrix} />
      {results.tickers.length >= 2 && (
        <RollingCorrelationChart
          tickers={tickers}
          rollingPair={rollingPair}
          setRollingPair={setRollingPair}
          rollingCorrData={rollingCorrData}
        />
      )}
    </div>
  );
});

const RollingMetricsTab = memo(function RollingMetricsTab({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
}) {
  return <RollingMetricsChart results={results} rollingWindow={rollingWindow} />;
});

const RiskReturnTab = memo(function RiskReturnTab({ results }: { results: AssetAnalysisResult }) {
  return <RiskReturnChart results={results} />;
});

const ReturnsTab = memo(function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <div className="space-y-6">
      <AnnualReturnChart results={results} />
      <MonthlyHeatmap results={results} />
    </div>
  );
});

/** 资产分析结果面板（错误态 + Tab 容器 + 内容切换 + 空态） */
export const AnalysisResultsPanel = memo(function AnalysisResultsPanel({
  error,
  results,
  activeTab,
  setActiveTab,
  isLoading,
  correlationWindow,
  rollingWindow,
}: {
  error: string | null;
  results: AssetAnalysisResult | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  correlationWindow: number;
  rollingWindow: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={`${t('analysis.analysisFailed')}：`} />
      {results && (
        <div className="card">
          <div className="result-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          <div className="result-content">
            {activeTab === 'summary' && <SummaryTab results={results} />}
            {activeTab === 'telltale' && <TelltaleTab results={results} />}
            {activeTab === 'correlations' && (
              <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />
            )}
            {activeTab === 'rolling' && (
              <RollingMetricsTab results={results} rollingWindow={rollingWindow} />
            )}
            {activeTab === 'risk-return' && <RiskReturnTab results={results} />}
            {activeTab === 'returns' && <ReturnsTab results={results} />}
          </div>
        </div>
      )}
      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          {t('analysis.noResultsHint')}
        </div>
      )}
    </div>
  );
});
