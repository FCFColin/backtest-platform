import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  Trash2,
  X,
  ChevronDown,
  Save,
  BarChart3,
  Check,
  Settings,
  Rocket,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router';
import { Card, Button, Input } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import BacktestParamsForm from '@/components/BacktestParamsForm.js';
import PortfolioEditor from '@/components/PortfolioEditor.js';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import type { TFunction } from 'i18next';
import type { BacktestParameters, Portfolio } from '@backtest/shared';
import {
  saveNamedConfigApi,
  listNamedConfigs,
  deleteNamedConfigApi,
  readStateFromURL,
  type SavedPortfolio,
} from '@/utils/portfolioStorage';
import { RunButton } from '@/components/form/sharedFields';
import { TableEmpty } from '@/components/stateDisplay.js';
import { ResultsContent } from './BacktestResults.js';
const HERO_KEY = 'backtest-hero-expanded';
const TOOLS = [
  { labelKey: 'nav.monteCarlo', path: '/monte-carlo' },
  { labelKey: 'nav.portfolioOptimize', path: '/optimizer' },
  { labelKey: 'nav.efficientFrontier', path: '/efficient-frontier' },
  { labelKey: 'nav.factorRegression', path: '/factor-regression' },
  { labelKey: 'nav.pca', path: '/pca' },
  { labelKey: 'nav.letfAnalysis', path: '/letf-slippage' },
] as const;

interface CapabilityCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items?: string[];
  tools?: Array<{ label: string; path: string }>;
  linkLabel?: string;
  linkTo?: string;
  subtitle?: string;
}

function CapabilityCard({
  icon: Icon,
  title,
  items,
  tools,
  linkLabel,
  linkTo,
  subtitle,
}: CapabilityCardProps) {
  return (
    <Card className="p-5 bg-surface border border-border-subtle hover:border-border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg cursor-default group">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-brand-subtle/8 rounded-lg group-hover:bg-brand-subtle/12 transition-colors">
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <h3 className="text-h3">{title}</h3>
      </div>
      {Array.isArray(items) && (
        <ul className="space-y-2 mb-4">
          {items.map((item, i) => (
            <li key={i} className="text-body text-fg-secondary flex items-start gap-2">
              <Check className="size-3.5 text-success mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {tools && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tools.map((tool) => (
            <Link
              key={tool.path}
              to={tool.path}
              className="text-caption px-2.5 py-1 bg-brand-subtle/8 text-brand rounded-md hover:bg-brand-subtle/15 transition-colors"
            >
              {tool.label}
            </Link>
          ))}
        </div>
      )}
      {subtitle && <p className="text-caption text-fg-tertiary mt-2">{subtitle}</p>}
      {linkLabel && linkTo && (
        <Link
          to={linkTo}
          className="text-caption text-brand hover:underline flex items-center gap-1"
        >
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </Card>
  );
}

function HeroDetails() {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-body text-fg-tertiary max-w-[860px] mb-8 leading-relaxed">
        {t(
          'This platform is a portfolio backtesting tool supporting ETFs, stocks, funds, synthetic tickers, and custom sequences. Compare multiple portfolios over the same historical period, test rebalancing rules, and simulate cashflow contributions or withdrawals.',
        )}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CapabilityCard
          icon={Settings}
          title={t('What You Can Model')}
          items={t('backtest.hero.model.items', { returnObjects: true }) as string[]}
          linkLabel={t('Start Configuring')}
          linkTo="#parameters"
        />
        <CapabilityCard
          icon={BarChart3}
          title={t('Metrics You Can Inspect')}
          items={t('backtest.hero.inspect.items', { returnObjects: true }) as string[]}
          linkLabel={t('View Results')}
          linkTo="#results"
          subtitle="60+"
        />
        <CapabilityCard
          icon={Rocket}
          title={t('Related Research Tools')}
          tools={TOOLS.map((tool) => ({ label: t(tool.labelKey), path: tool.path }))}
        />
      </div>
    </>
  );
}

export const BacktestHero = memo(function BacktestHero() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    try {
      const v = localStorage.getItem(HERO_KEY);
      return v === null || v === '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(HERO_KEY, expanded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [expanded]);
  return (
    <section className={cn('page-container', 'pt-4 pb-6')} data-testid="page-hero">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-display md:text-display-xl text-fg mb-3" data-testid="page-title">
            {t('nav.portfolioBacktest')}
          </h1>
          <p className="text-h2 text-fg-secondary font-normal max-w-[720px]">
            {t(
              'Professional tools for backtesting portfolios, asset allocations, and retirement cashflows',
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-caption text-fg-tertiary hover:text-fg"
        >
          {expanded ? (
            <>
              {t('Hide Intro')} <ChevronUp className="h-4 w-4 ml-1" />
            </>
          ) : (
            <>
              {t('Show Intro')} <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
      {expanded && <HeroDetails />}
    </section>
  );
});
function useUrlShareLoader() {
  const { t } = useTranslation();
  const loadFromShare = useBacktestStore((s) => s.loadFromShare);
  const hasLoadedFromShare = useBacktestStore((s) => s.hasLoadedFromShare);
  const setHasLoadedFromShare = useBacktestStore((s) => s.setHasLoadedFromShare);
  useEffect(() => {
    if (hasLoadedFromShare) return;
    setHasLoadedFromShare(true);
    const urlState = readStateFromURL();
    if (urlState) {
      loadFromShare(urlState);
      useToastStore.getState().addToast('success', t('Configuration loaded from share link'));
      return;
    }
    const loadFromOptimizer = localStorage.getItem('bt_load_from_optimizer');
    if (loadFromOptimizer) {
      localStorage.removeItem('bt_load_from_optimizer');
      try {
        const data = JSON.parse(loadFromOptimizer);
        const sharePortfolios: Portfolio[] = (data.portfolios || []).map((p: Portfolio) => ({
          ...p,
          id: p.id || `portfolio-${Date.now()}`,
        }));
        const shareParameters: BacktestParameters = data.parameters;
        if (sharePortfolios.length > 0 && shareParameters)
          loadFromShare({ portfolios: sharePortfolios, parameters: shareParameters });
      } catch {
        useToastStore
          .getState()
          .addToast('warning', t('Optimizer data format error, unable to load'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时从 URL/optimizer 加载配置
  }, [loadFromShare, hasLoadedFromShare, setHasLoadedFromShare]);
}
function useBacktestPageState() {
  const { t } = useTranslation();
  const runBacktest = useBacktestStore((s) => s.runBacktest);
  const parameters = useBacktestStore((s) => s.parameters);
  const portfolios = useBacktestStore((s) => s.portfolios);
  useUrlShareLoader();
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [configName, setConfigName] = useState('');
  const [showLoadList, setShowLoadList] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedPortfolio[]>([]);
  const handleSaveConfig = async () => {
    const name = configName.trim();
    if (!name) return;
    await saveNamedConfigApi(name, portfolios, parameters);
    useToastStore.getState().addToast('success', t('Scheme saved'));
    setConfigName('');
    setShowSaveInput(false);
  };
  const handleOpenLoadList = async () => {
    const next = !showLoadList;
    setShowLoadList(next);
    setShowSaveInput(false);
    if (next) setSavedConfigs(await listNamedConfigs());
  };
  const handleLoadConfig = (config: SavedPortfolio) => {
    useBacktestStore
      .getState()
      .loadFromShare({ portfolios: config.portfolios, parameters: config.parameters });
    useToastStore.getState().addToast('success', t('Scheme loaded'));
    setShowLoadList(false);
  };
  const handleDeleteConfig = async (id: string) => {
    await deleteNamedConfigApi(id);
    setSavedConfigs(await listNamedConfigs());
  };
  return {
    t,
    runBacktest,
    parameters,
    portfolios,
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
  };
}
export interface BacktestPageState {
  t: TFunction;
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
type S = ReturnType<typeof useBacktestPageState>;
type TF = (k: string) => string;
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
  t: TF;
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
  locale,
}: {
  savedConfigs: SavedPortfolio[];
  handleLoadConfig: (c: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  t: TF;
  locale: string;
}) {
  return (
    <div className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-border-subtle bg-elevated">
      {savedConfigs.length === 0 ? (
        <TableEmpty message={t('No saved schemes')} className="px-3 py-3 text-caption" />
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
                {new Date(config.savedAt).toLocaleString(locale)} · {config.portfolios.length}{' '}
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
function BacktestToolbar({ state }: { state: S }) {
  const { t, i18n } = useTranslation();
  const {
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
  } = state;
  const isLoading = useBacktestStore((s) => s.isLoading);
  const portfolioCount = useBacktestStore((s) => s.portfolios.length);
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-4">
      <div className="flex items-center gap-2">
        <RunButton
          isLoading={isLoading}
          onClick={runBacktest}
          label={t('Run Backtest')}
          loadingLabel={t('Backtesting...')}
          disabled={portfolioCount === 0}
          data-testid="backtest-run"
        />
        <Button variant="secondary" onClick={() => void handleOpenLoadList()}>
          <FolderOpen />
          {t('Load Saved Backtest')}
          <ChevronDown className="size-3.5" />
        </Button>
        <Button variant="secondary" onClick={() => setShowSaveInput(true)}>
          <Save className="size-4" />
          {t('Save')}
        </Button>
      </div>
      {portfolioCount === 0 && (
        <p className="text-caption text-fg-tertiary">{t('Please add at least one portfolio')}</p>
      )}
      {showSaveInput && (
        <SaveInputRow
          configName={configName}
          setConfigName={setConfigName}
          handleSaveConfig={handleSaveConfig}
          setShowSaveInput={setShowSaveInput}
          t={t}
        />
      )}
      {showLoadList && (
        <LoadListPanel
          savedConfigs={savedConfigs}
          handleLoadConfig={handleLoadConfig}
          handleDeleteConfig={handleDeleteConfig}
          t={t}
          locale={i18n.language}
        />
      )}
    </div>
  );
}
const config: ComputeToolConfig<S> = {
  titleKey: 'nav.portfolioBacktest',
  hidePageTitle: true,
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
  params: BacktestParamsForm,
  afterParams: ({ state }) => (
    <Card className="p-5">
      <PortfolioEditor />
      <BacktestToolbar state={state} />
    </Card>
  ),
  results: ResultsContent,
};
export default function BacktestPage() {
  const state = useBacktestPageState();
  return (
    <>
      <BacktestHero />
      <div className="page-container border-t border-border-subtle" />
      <ComputeToolShell config={config} state={state} />
    </>
  );
}
