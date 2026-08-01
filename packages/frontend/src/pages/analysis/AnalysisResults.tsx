import { useState, memo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import type { AssetAnalysisResult } from '@backtest/shared';
import { AnalysisErrorAlert } from '@/components/resultsShell.js';
import { EmptyState } from '@/components/stateDisplay';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/uiComponents';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { TABS } from './analysisUtils.js';
import { Loader2 } from '@/icons/icons.js';
const OverviewCharts = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.OverviewCharts })),
);
const TelltaleChart = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.TelltaleChart })),
);
const StatsTable = lazy(() =>
  import('../../components/AnalysisStats.js').then((m) => ({ default: m.StatsTable })),
);
const CorrelationMatrixTable = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.CorrelationMatrixTable })),
);
const BetaMatrixTable = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.BetaMatrixTable })),
);
const RollingCorrelationChart = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({
    default: m.RollingCorrelationChart,
  })),
);
const RollingMetricsChart = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.RollingMetricsChart })),
);
const RiskReturnChart = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.RiskReturnChart })),
);
const AnnualReturnChart = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.AnnualReturnChart })),
);
const MonthlyHeatmap = lazy(() =>
  import('../../components/AnalysisCharts.js').then((m) => ({ default: m.MonthlyHeatmap })),
);
function TabFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}
const SummaryTab = memo(function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <Suspense fallback={<TabFallback />}>
      <OverviewCharts results={results} StatsTable={StatsTable} />
    </Suspense>
  );
});
const TelltaleTab = memo(function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <Suspense fallback={<TabFallback />}>
      <TelltaleChart results={results} />
    </Suspense>
  );
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
            <Suspense fallback={<TabFallback />}>
              <SummaryTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="telltale" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <TelltaleTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="correlations" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />
            </Suspense>
          </TabsContent>
          <TabsContent value="rolling" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <RollingMetricsTab results={results} rollingWindow={rollingWindow} />
            </Suspense>
          </TabsContent>
          <TabsContent value="risk-return" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <RiskReturnTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="returns" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <ReturnsTab results={results} />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}
      {!results && !error && !isLoading && (
        <EmptyState icon={LineChart} title={t('analysis.noResultsHint')} />
      )}
    </div>
  );
});
