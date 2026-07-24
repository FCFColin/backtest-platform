/**
 * @file 资产分析结果面板与 Tab 包装组件
 * @description 承载 Tab 切换容器与 6 个 Tab 内容包装（Summary/Telltale/Correlations/Rolling/RiskReturn/Returns）。
 *   基于 shadcn Tabs（受控，value/onValueChange 由父级 activeTab 驱动）。
 */
import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
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
import { EmptyState } from '@/components/EmptyState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

/**
 * 资产分析结果面板。
 *
 * 结构：错误提示 + shadcn Tabs（受控）+ 各 Tab 内容 + 空态。
 * 外层 Card 由 ComputeToolShell 的 ToolPageLayout 提供，本组件不再重复包裹。
 * @param props - error/results/activeTab/setActiveTab/isLoading/correlationWindow/rollingWindow
 * @returns 渲染的结果面板
 */
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary" className="pt-4">
            <SummaryTab results={results} />
          </TabsContent>
          <TabsContent value="telltale" className="pt-4">
            <TelltaleTab results={results} />
          </TabsContent>
          <TabsContent value="correlations" className="pt-4">
            <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />
          </TabsContent>
          <TabsContent value="rolling" className="pt-4">
            <RollingMetricsTab results={results} rollingWindow={rollingWindow} />
          </TabsContent>
          <TabsContent value="risk-return" className="pt-4">
            <RiskReturnTab results={results} />
          </TabsContent>
          <TabsContent value="returns" className="pt-4">
            <ReturnsTab results={results} />
          </TabsContent>
        </Tabs>
      )}
      {!results && !error && !isLoading && (
        <EmptyState icon={LineChart} title={t('analysis.noResultsHint')} />
      )}
    </div>
  );
});
