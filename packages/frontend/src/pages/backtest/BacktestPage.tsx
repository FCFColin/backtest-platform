import { Card } from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import BacktestParamsForm from '@/components/BacktestParamsForm.js';
import PortfolioEditor from '@/components/PortfolioEditor.js';
import { useBacktestPageState } from './hooks/useBacktestPageState.js';
import { BacktestToolbar } from './BacktestToolbar.js';
import { ResultsContent } from './BacktestResults.js';
import { BacktestHero } from './BacktestHero.js';
type BacktestState = ReturnType<typeof useBacktestPageState>;
function BacktestParamsWrapper({ state }: { state: BacktestState }) {
  return (
    <>
      <BacktestParamsForm />
      <BacktestToolbar
        runBacktest={state.runBacktest}
        showSaveInput={state.showSaveInput}
        setShowSaveInput={state.setShowSaveInput}
        configName={state.configName}
        setConfigName={state.setConfigName}
        handleSaveConfig={state.handleSaveConfig}
        showLoadList={state.showLoadList}
        handleOpenLoadList={state.handleOpenLoadList}
        savedConfigs={state.savedConfigs}
        handleLoadConfig={state.handleLoadConfig}
        handleDeleteConfig={state.handleDeleteConfig}
        handleShareLink={state.handleShareLink}
      />
    </>
  );
}
function PortfolioWrapper(_: { state: BacktestState }) {
  return (
    <Card className="p-5">
      <PortfolioEditor />
    </Card>
  );
}
function BacktestResultsWrapper(_: { state: BacktestState }) {
  return <ResultsContent />;
}
const config: ComputeToolConfig<BacktestState> = {
  titleKey: 'backtest.title',
  hidePageTitle: true,
  paramsTitleKey: 'params.basicParams',
  seoSubtitleKey: 'backtest.seoSubtitle',
  seoDescKey: 'backtest.seoDesc',
  seoFeatures: [
    { titleKey: 'backtest.seoModelable', descKey: 'backtest.seoModelableDesc' },
    { titleKey: 'backtest.seoViewable', descKey: 'backtest.seoViewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  params: BacktestParamsWrapper,
  afterParams: PortfolioWrapper,
  results: BacktestResultsWrapper,
};
export default function BacktestPage() {
  const state = useBacktestPageState();
  return (
    <>
      <BacktestHero />
      <ComputeToolShell config={config} state={state} />
    </>
  );
}
