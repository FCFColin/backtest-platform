import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/uiComponents';
import ErrorBanner from '@/components/ErrorBanner';
import { BacktestEmptyState, BacktestResultTab } from './TacticalCharts';
import { WhatIfTab } from './TacticalTables';
import { TABS, useTacticalPageState } from './TacticalUtils';
type TacticalPageState = ReturnType<typeof useTacticalPageState>;
function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={t('tactical.results.backtestFailedDetail', { error })} />}
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
export { TacticalResultsPanel };
