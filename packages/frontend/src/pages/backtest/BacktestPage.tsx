import { useTranslation } from 'react-i18next';
import { FolderOpen, Trash2, X, ChevronDown } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import BacktestParamsForm from '@/components/BacktestParamsForm.js';
import PortfolioEditor from '@/components/PortfolioEditor.js';
import { useBacktestStore } from '@/store/backtestStore';
import type { TFunction } from 'i18next';
import type { BacktestParameters, Portfolio } from '@backtest/shared';
import type { SavedPortfolio } from '@/utils/portfolioStorage';
import { useBacktestPageState } from './hooks/useBacktestPageState.js';
import { RunButton } from '@/components/form/sharedFields';
import { ResultsContent } from './BacktestResults.js';
import { BacktestHero } from './BacktestHero.js';
export interface BacktestPageState {
  t: TFunction;
  seoProps: {
    desc: string;
    features: { title: string; desc: string }[];
    related: { title: string; href: string }[];
    relatedLabel: string;
  };
  runBacktest: () => void;
  parameters: BacktestParameters;
  portfolios: Portfolio[];
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  configName: string;
  setConfigName: (v: string) => void;
  showLoadList: boolean;
  savedConfigs: SavedPortfolio[];
  handleSaveConfig: () => Promise<void>;
  handleOpenLoadList: () => Promise<void>;
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
}
type BacktestToolbarProps = Pick<
  BacktestPageState,
  | 'runBacktest'
  | 'showSaveInput'
  | 'setShowSaveInput'
  | 'configName'
  | 'setConfigName'
  | 'handleSaveConfig'
  | 'showLoadList'
  | 'handleOpenLoadList'
  | 'savedConfigs'
  | 'handleLoadConfig'
  | 'handleDeleteConfig'
>;
type BacktestState = ReturnType<typeof useBacktestPageState>;
type TFunc = (k: string) => string;
function SaveInputRow({
  configName,
  setConfigName,
  handleSaveConfig,
  setShowSaveInput,
  t,
}: {
  configName: string;
  setConfigName: (v: string) => void;
  handleSaveConfig: () => Promise<void>;
  setShowSaveInput: (v: boolean) => void;
  t: TFunc;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Input
        type="text"
        value={configName}
        onChange={(e) => setConfigName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSaveConfig();
        }}
        placeholder={t('Enter scheme name')}
        className="flex-1"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: form input focus on modal open
        autoFocus
      />
      <Button variant="secondary" size="sm" onClick={() => void handleSaveConfig()}>
        {t('Confirm')}
      </Button>
      <Button
        variant="destructive"
        size="icon"
        onClick={() => {
          setShowSaveInput(false);
          setConfigName('');
        }}
        title={t('Cancel')}
        aria-label={t('Cancel')}
      >
        <X />
      </Button>
    </div>
  );
}
function LoadListPanel({
  savedConfigs,
  handleLoadConfig,
  handleDeleteConfig,
  t,
}: {
  savedConfigs: SavedPortfolio[];
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  t: TFunc;
}) {
  return (
    <div className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-border-subtle bg-elevated">
      {savedConfigs.length === 0 ? (
        <div className="px-3 py-3 text-center text-caption text-fg-tertiary">
          {t('No saved schemes')}
        </div>
      ) : (
        savedConfigs.map((config) => (
          <div
            key={config.id}
            className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle last:border-b-0"
          >
            <button
              onClick={() => handleLoadConfig(config)}
              className="flex-1 text-left bg-transparent border-none cursor-pointer p-0"
            >
              <div className="text-body font-medium text-fg">{config.name}</div>
              <div className="text-caption text-fg-tertiary">
                {new Date(config.savedAt).toLocaleString('zh-CN')} · {config.portfolios.length}{' '}
                {t('portfolios')}
              </div>
            </button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => void handleDeleteConfig(config.id)}
              title={t('Delete')}
              aria-label={t('Delete')}
            >
              <Trash2 />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
function BacktestToolbar(props: BacktestToolbarProps) {
  const { t } = useTranslation();
  const isLoading = useBacktestStore((s) => s.isLoading);
  const portfolioCount = useBacktestStore((s) => s.portfolios.length);
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-4">
      <div className="flex items-center gap-2">
        <RunButton
          isLoading={isLoading}
          onClick={props.runBacktest}
          label={t('Run Backtest')}
          loadingLabel={t('Backtesting...')}
          disabled={portfolioCount === 0}
          data-testid="backtest-run"
        />
        <Button variant="secondary" onClick={() => void props.handleOpenLoadList()}>
          <FolderOpen />
          {t('LOAD SAVED BACKTEST')}
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      {props.showSaveInput && (
        <SaveInputRow
          configName={props.configName}
          setConfigName={props.setConfigName}
          handleSaveConfig={props.handleSaveConfig}
          setShowSaveInput={props.setShowSaveInput}
          t={t}
        />
      )}
      {props.showLoadList && (
        <LoadListPanel
          savedConfigs={props.savedConfigs}
          handleLoadConfig={props.handleLoadConfig}
          handleDeleteConfig={props.handleDeleteConfig}
          t={t}
        />
      )}
    </div>
  );
}
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
  titleKey: 'nav.portfolioBacktest',
  hidePageTitle: true,
  paramsTitleKey: 'params.basicParams',
  seoSubtitleKey: 'nav.portfolioBacktest',
  seoDescKey: 'backtest.seoDesc',
  seoFeatures: [
    { titleKey: 'backtest.seoModelable', descKey: 'backtest.seoModelableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'backtest.seoViewableDesc' },
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
