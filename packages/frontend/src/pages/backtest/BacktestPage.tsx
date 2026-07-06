import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { BacktestSeoCard } from '@/components/backtestPage/BacktestPagePresets.js';
import { BacktestToolbar } from '@/components/backtestPage/BacktestPageParams.js';
import { ResultsContent } from '@/components/backtestPage/BacktestPageResults.js';
import { useBacktestPageState } from '@/hooks/useBacktestPageState.js';
import ParameterPanel from '@/components/ParameterPanel';
import PortfolioEditor from '@/components/PortfolioEditor';

export default function BacktestPage() {
  const { t } = useTranslation();
  const isLoading = useBacktestStore((s) => s.isLoading);
  const runBacktest = useBacktestStore((s) => s.runBacktest);
  const {
    showSaveInput,
    setShowSaveInput,
    configName,
    setConfigName,
    showLoadList,
    savedConfigs,
    handleSaveConfig,
    handleOpenLoadList,
    handleLoadConfig,
    handleDeleteConfig,
    handleShareLink,
  } = useBacktestPageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('backtest.title')}</h1>
      </div>
      <BacktestSeoCard />
      <div className="bt-main-card card bt-layout">
        <div className="bt-layout-left">
          <ParameterPanel />
          <PortfolioEditor />
          <BacktestToolbar
            isLoading={isLoading}
            runBacktest={runBacktest}
            showSaveInput={showSaveInput}
            setShowSaveInput={setShowSaveInput}
            configName={configName}
            setConfigName={setConfigName}
            handleSaveConfig={handleSaveConfig}
            showLoadList={showLoadList}
            handleOpenLoadList={handleOpenLoadList}
            savedConfigs={savedConfigs}
            handleLoadConfig={handleLoadConfig}
            handleDeleteConfig={handleDeleteConfig}
            handleShareLink={handleShareLink}
          />
        </div>
        <ResultsContent />
      </div>
    </div>
  );
}
