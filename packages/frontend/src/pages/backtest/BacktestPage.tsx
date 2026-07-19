/**
 * @file 回测页面
 * @description 平台核心页面容器：组合参数表单、组合编辑器、工具栏与结果展示区。
 *              状态/副作用统一由 useBacktestPageState 持有，本文件仅做容器组合。
 * @route /
 */
import { ToolSeoCard } from '../../components/layout/index.js';
import BacktestParamsForm from '@/components/BacktestParamsForm';
import PortfolioEditor from '@/components/PortfolioEditor';
import { useBacktestPageState } from './hooks/useBacktestPageState.js';
import { BacktestToolbar } from './BacktestToolbar.tsx';
import { ResultsContent } from './BacktestResults.tsx';

export default function BacktestPage() {
  const {
    t,
    seoProps,
    runBacktest,
    showSaveInput,
    setShowSaveInput,
    configName,
    setConfigName,
    handleSaveConfig,
    showLoadList,
    handleOpenLoadList,
    savedConfigs,
    handleLoadConfig,
    handleDeleteConfig,
    handleShareLink,
  } = useBacktestPageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('backtest.title')}</h1>
      </div>
      <ToolSeoCard {...seoProps} />
      <div className="bt-main-card card bt-layout">
        <div className="bt-layout-left">
          <BacktestParamsForm />
          <PortfolioEditor />
          <BacktestToolbar
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
