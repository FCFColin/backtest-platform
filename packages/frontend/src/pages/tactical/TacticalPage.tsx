import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/uiComponents';
import { ErrorBanner, EmptyState } from '@/components/stateDisplay';
import { SortableTable, type Column } from '@/components/tables';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import { buildGrowthData, buildStatRows, type StatRow } from './tacticalResultUtils';
import { SignalHistoryTable, WhatIfTab } from './TacticalTables';
import { TABS, useTacticalPageState } from './TacticalUtils';
import type { BacktestResponse } from './TacticalUtils';
import { TacticalParamsPanel } from './TacticalParams.js';
import { GridParamsPanel } from './TacticalGridParams.js';
import { GridResultsPanel } from './TacticalGridResults.js';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
type TacticalPageState = ReturnType<typeof useTacticalPageState>;
function ChartCardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-h3 text-fg">{children}</h3>;
}
function GrowthChart({ growthData }: { growthData: Array<Record<string, number | string>> }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <ChartCardTitle>{t('Growth Curve')}</ChartCardTitle>
      <TimeSeriesLineChart
        data={growthData}
        height={380}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        series={[
          { dataKey: 'tactical', legendName: t('Tactical') },
          {
            dataKey: 'benchmark',
            legendName: t('Equal Weight'),
            strokeDasharray: '6 3',
          },
        ]}
      />
    </Card>
  );
}
function BacktestResultTab({ results }: { results: BacktestResponse }) {
  const { t } = useTranslation();
  const { portfolio, benchmark, signalHistory } = results;
  const growthData = useMemo(() => buildGrowthData(portfolio, benchmark), [portfolio, benchmark]);
  const statRows = useMemo(() => buildStatRows(portfolio, benchmark, t), [portfolio, benchmark, t]);
  const statColumns: Column<StatRow>[] = [
    { key: 'metric', label: t('Metric') },
    {
      key: 'tactical',
      label: t('Tactical'),
      sortValue: (r) => r._sortTactical,
      render: (r) => <span className="font-mono tabular-nums">{r.tactical}</span>,
    },
    {
      key: 'benchmark',
      label: t('Equal Weight'),
      render: (r) => <span className="font-mono tabular-nums">{r.benchmark}</span>,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <GrowthChart growthData={growthData} />
      <Card className="p-4">
        <ChartCardTitle>{t('Statistics')}</ChartCardTitle>
        <SortableTable
          columns={statColumns}
          data={statRows}
          initialSortKey="tactical"
          initialSortDir="desc"
        />
      </Card>
      {signalHistory.length > 0 && <SignalHistoryTable signalHistory={signalHistory} />}
    </div>
  );
}
function BacktestEmptyState() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={LineChart}
      title={t(
        'Configure signals and parameters, then click "Run Tactical Backtest" to see results',
      )}
      className="py-16"
    />
  );
}
function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={t('Backtest failed: {{error}}', { error })} />}
      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="backtest">
            {results ? <BacktestResultTab results={results} /> : <BacktestEmptyState />}
          </TabsContent>
          <TabsContent value="whatif">
            <WhatIfTab strategy={strategy} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
const config: ComputeToolConfig<TacticalPageState> = {
  titleKey: 'tactical.title',
  seoDescKey: 'tactical.seo.desc',
  seoFeatures: [
    { titleKey: 'lumpSumDca.seo.configurableTitle', descKey: 'tactical.seo.configurableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'tactical.seo.viewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
  ],
  params: TacticalParamsPanel,
  results: TacticalResultsPanel,
};
export default function TacticalPage() {
  const s = useTacticalPageState();
  return <ComputeToolShell config={config} state={s} />;
}
const gridConfig: ComputeToolConfig<TacticalGridState> = {
  titleKey: 'tacticalGrid.title',
  params: GridParamsPanel,
  results: GridResultsPanel,
};
export function TacticalGridPage() {
  const { t } = useTranslation();
  const s = useTacticalGridState(t);
  return <ComputeToolShell config={gridConfig} state={s} />;
}
