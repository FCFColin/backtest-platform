/**
 * @file 回测页面
 * @description 平台核心页面，提供投资组合回测参数配置、执行及结果可视化展示，包含增长曲线、回撤、统计指标等多种图表
 * @route /
 */
import { useEffect, lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Play, Loader2, Save, FolderOpen, Trash2, X, Share2 } from 'lucide-react';
import { type SavedPortfolio } from '@/utils/portfolioStorage';
import { saveNamedConfigApi, listNamedConfigs, deleteNamedConfigApi } from '@/utils/configApi';
import { readStateFromURL, writeStateToURL } from '@/utils/urlState';
import ParameterPanel from '@/components/ParameterPanel';
import PortfolioEditor from '@/components/PortfolioEditor';
import StatisticsTable from '@/components/StatisticsTable';
import type { Portfolio, BacktestParameters, PortfolioResult } from '@backtest/shared';

const GrowthChart = lazy(() => import('@/components/charts/GrowthChart'));
const DrawdownChart = lazy(() => import('@/components/charts/DrawdownChart'));
const ReturnsTabDailyChart = lazy(() => import('@/components/charts/ReturnsTabDailyChart'));
const TelltaleChart = lazy(() => import('@/components/charts/TelltaleChart'));
const RiskReturnScatter = lazy(() => import('@/components/charts/RiskReturnScatter'));
const SeasonalityChart = lazy(() => import('@/components/charts/SeasonalityChart'));
const RegressionChart = lazy(() => import('@/components/charts/RegressionChart'));
const PortfolioAllocationChart = lazy(() => import('@/components/charts/PortfolioAllocationChart'));
const PortfolioPiesChart = lazy(() => import('@/components/charts/PortfolioPiesChart'));
const RollingReturnChart = lazy(() => import('@/components/charts/RollingReturnChart'));
const AnnualReturnChart = lazy(() => import('@/components/charts/AnnualReturnChart'));
const MonthlyReturnHeatmap = lazy(() => import('@/components/charts/MonthlyReturnHeatmap'));
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationMatrix'));
const CustomMetricsTable = lazy(() => import('@/components/CustomMetricsTable'));
const DrawdownEpisodes = lazy(() => import('@/components/DrawdownEpisodes'));
const RebalancingStats = lazy(() => import('@/components/RebalancingStats'));
const CashflowsLog = lazy(() => import('@/components/CashflowsLog'));
const TurnoverTaxReport = lazy(() => import('@/components/TurnoverTaxReport'));

const TAB_GROUPS = [
  { groupKey: 'tabs.summary', tabs: [{ key: 'summary', labelKey: 'tabs.summary' }] },
  {
    groupKey: 'tabs.returns',
    tabs: [
      { key: 'metrics', labelKey: 'tabs.metrics' },
      { key: 'myMetrics', labelKey: 'tabs.myMetrics' },
      { key: 'returns', labelKey: 'tabs.returnsDist' },
      { key: 'rolling', labelKey: 'tabs.rolling' },
      { key: 'seasonality', labelKey: 'tabs.seasonality' },
      { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
    ],
  },
  {
    groupKey: 'tabs.events',
    tabs: [
      { key: 'cashflows', labelKey: 'tabs.cashflows' },
      { key: 'rebalancing', labelKey: 'tabs.rebalancing' },
      { key: 'turnover', labelKey: 'tabs.turnover' },
    ],
  },
  {
    groupKey: 'tabs.allocation',
    tabs: [
      { key: 'allocation', labelKey: 'tabs.portfolioAllocation' },
      { key: 'pies', labelKey: 'tabs.pies' },
      { key: 'correlation', labelKey: 'tabs.correlation' },
    ],
  },
  {
    groupKey: 'tabs.signalsStatus',
    tabs: [
      { key: 'telltale', labelKey: 'tabs.telltale' },
      { key: 'regression', labelKey: 'tabs.regression' },
    ],
  },
];

function BacktestSeoCard() {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">{t('backtest.seoDesc')}</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('backtest.seoModelable')}</div>
          <div className="bt-seo-feature-desc">{t('backtest.seoModelableDesc')}</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('backtest.seoViewable')}</div>
          <div className="bt-seo-feature-desc">{t('backtest.seoViewableDesc')}</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">{t('backtest.relatedTools')}</span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.monteCarlo')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.portfolioOptimize')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.efficientFrontier')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.assetAnalysis')}
        </Link>
      </div>
    </div>
  );
}

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
  t: (k: string) => string;
}) {
  return (
    <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
      <input
        type="text"
        value={configName}
        onChange={(e) => setConfigName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSaveConfig();
        }}
        placeholder={t('backtest.configNamePlaceholder')}
        className="param-input"
        style={{ flex: 1 }}
        autoFocus
      />
      <button onClick={() => void handleSaveConfig()} className="toolbar-btn">
        {t('common.confirm')}
      </button>
      <button
        onClick={() => {
          setShowSaveInput(false);
          setConfigName('');
        }}
        className="row-remove-btn"
        title={t('common.cancel')}
      >
        <X className="w-4 h-4" />
      </button>
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
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        marginTop: '8px',
        maxHeight: '240px',
        overflowY: 'auto',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--bg-subtle)',
      }}
    >
      {savedConfigs.length === 0 ? (
        <div
          style={{
            padding: '12px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            textAlign: 'center',
          }}
        >
          {t('backtest.noSavedSchemes')}
        </div>
      ) : (
        savedConfigs.map((config) => (
          <div
            key={config.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            <button
              onClick={() => handleLoadConfig(config)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-body)',
                fontSize: '13px',
                padding: 0,
              }}
            >
              <div style={{ fontWeight: 500 }}>{config.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {new Date(config.savedAt).toLocaleString('zh-CN')} · {config.portfolios.length}{' '}
                {t('backtest.portfoliosCount')}
              </div>
            </button>
            <button
              onClick={() => void handleDeleteConfig(config.id)}
              className="row-remove-btn"
              title={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function BacktestToolbar(props: {
  runBacktest: () => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  configName: string;
  setConfigName: (v: string) => void;
  handleSaveConfig: () => Promise<void>;
  showLoadList: boolean;
  handleOpenLoadList: () => Promise<void>;
  savedConfigs: SavedPortfolio[];
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  handleShareLink: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const isLoading = useBacktestStore((s) => s.isLoading);
  return (
    <div className="bt-action-row">
      <button
        onClick={props.runBacktest}
        disabled={isLoading}
        className="main-action-btn"
        style={{ width: '100%' }}
        data-testid="backtest-run"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {isLoading ? t('backtest.running') : t('backtest.runButton')}
      </button>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={() => props.setShowSaveInput(!props.showSaveInput)}
          className="toolbar-btn"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Save className="w-3.5 h-3.5" /> {t('backtest.savePortfolio')}
        </button>
        <button
          onClick={() => void props.handleOpenLoadList()}
          className="toolbar-btn"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <FolderOpen className="w-3.5 h-3.5" /> {t('backtest.loadPortfolio')}
        </button>
        <button
          onClick={props.handleShareLink}
          className="toolbar-btn"
          title={t('backtest.shareLink')}
          style={{ justifyContent: 'center' }}
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
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

function TabBar() {
  const { t } = useTranslation();
  const activeTab = useBacktestStore((s) => s.activeTab);
  const setActiveTab = useBacktestStore((s) => s.setActiveTab);
  return (
    <div className="result-tabs">
      {TAB_GROUPS.map((group) => (
        <div key={group.groupKey} className="result-tab-group">
          <div className="result-tab-group-label">{t(group.groupKey)}</div>
          {group.tabs.map((tab) => (
            <button
              key={tab.key}
              className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Loader2 className="w-5 h-5 animate-spin" style={{ display: 'inline-block' }} />
    </div>
  );
}

type TabCtx = {
  pf: PortfolioResult[];
  pfs: Portfolio[];
  r: {
    assetTickers?: string[];
    assetCorrelations?: number[][];
    correlations?: number[][];
    portfolios?: PortfolioResult[];
  };
};
const TAB_RENDERERS: Record<string, (c: TabCtx) => React.ReactNode> = {
  summary: ({ pf }) => (
    <>
      <GrowthChart portfolios={pf} />
      <DrawdownChart portfolios={pf} />
      <StatisticsTable portfolios={pf} />
      <DrawdownEpisodes portfolios={pf} />
    </>
  ),
  metrics: ({ pf }) => <StatisticsTable portfolios={pf} />,
  myMetrics: ({ pf }) => <CustomMetricsTable portfolios={pf} />,
  returns: ({ pf }) => (
    <>
      <AnnualReturnChart portfolios={pf} />
      {pf.map((x) => (
        <MonthlyReturnHeatmap key={x.name} portfolio={x} />
      ))}
      <ReturnsTabDailyChart portfolios={pf} bins={[]} />
    </>
  ),
  rolling: ({ pf }) => <RollingReturnChart portfolios={pf} />,
  seasonality: ({ pf }) => <SeasonalityChart portfolios={pf} />,
  riskReturn: ({ pf }) => <RiskReturnScatter portfolios={pf} />,
  cashflows: () => <CashflowsLog parameters={useBacktestStore.getState().parameters} />,
  rebalancing: ({ pfs }) => <RebalancingStats portfolios={pfs} />,
  turnover: ({ pf }) => <TurnoverTaxReport portfolios={pf} />,
  allocation: ({ pf, pfs }) => (
    <PortfolioAllocationChart
      portfolios={(pf ?? []).map(
        (rp, idx) =>
          ({
            name: rp.name,
            assets: pfs[idx]?.assets ?? [],
            growthCurve: rp.growthCurve,
            allocationHistory: rp.allocationHistory,
          }) as never,
      )}
    />
  ),
  pies: ({ pfs }) => <PortfolioPiesChart portfolios={pfs} />,
  correlation: ({ pf, r }) => (
    <CorrelationWithBeta
      portfolios={pf}
      assetTickers={r?.assetTickers}
      assetCorrelations={r?.assetCorrelations}
      portfolioCorrelations={r?.correlations}
    />
  ),
  telltale: ({ pf }) => <TelltaleChart portfolios={pf} />,
  regression: ({ pf }) => <RegressionChart portfolios={pf} />,
};

function TabContent({
  activeTab,
  pfResults,
  portfolios,
  results,
}: {
  activeTab: string;
  pfResults: PortfolioResult[];
  portfolios: Portfolio[];
  results: TabCtx['r'];
}) {
  const renderer = TAB_RENDERERS[activeTab];
  return renderer ? <>{renderer({ pf: pfResults, pfs: portfolios, r: results })}</> : null;
}

function ResultsContent() {
  const { t } = useTranslation();
  const results = useBacktestStore((s) => s.results);
  const isLoading = useBacktestStore((s) => s.isLoading);
  const activeTab = useBacktestStore((s) => s.activeTab);
  const portfolios = useBacktestStore((s) => s.portfolios);
  const enrichSeries = useBacktestStore((s) => s.enrichSeries);

  useEffect(() => {
    if (!results) return;
    if (activeTab === 'rolling') void enrichSeries(['rollingReturns']);
    else if (activeTab === 'turnover' || activeTab === 'allocation')
      void enrichSeries(['allocationHistory']);
    else if (activeTab === 'summary') void enrichSeries(['drawdownEpisodes']);
  }, [activeTab, results, enrichSeries]);

  if (isLoading && !results)
    return (
      <div className="bt-results-card card" style={{ textAlign: 'center', padding: 40 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ display: 'inline-block' }} />
      </div>
    );
  if (!results || results.portfolios.length === 0)
    return (
      <div
        className="bt-results-card card"
        style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}
      >
        {t('backtest.noResults')}
      </div>
    );

  return (
    <div className="bt-results-card card">
      <TabBar />
      <Suspense fallback={<LoadingFallback />}>
        <TabContent
          activeTab={activeTab}
          pfResults={results.portfolios}
          portfolios={portfolios}
          results={results as TabCtx['r']}
        />
      </Suspense>
    </div>
  );
}

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
      useToastStore.getState().addToast('success', t('backtest.loadedFromShare'));
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
        useToastStore.getState().addToast('warning', t('backtest.optimizerDataError'));
      }
    }
    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
      try {
        const json = decodeURIComponent(atob(hash.slice(7)));
        const data = JSON.parse(json);
        const sharePortfolios: Portfolio[] = (data.p || []).map((p: Portfolio) => ({
          ...p,
          id: p.id || `portfolio-${Date.now()}`,
        }));
        const shareParameters: BacktestParameters = data.params;
        if (sharePortfolios.length > 0 && shareParameters) {
          loadFromShare({ portfolios: sharePortfolios, parameters: shareParameters });
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        useToastStore.getState().addToast('warning', t('backtest.shareDataError'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时从 URL hash 加载分享数据
  }, [loadFromShare, hasLoadedFromShare, setHasLoadedFromShare]);
}

export default function BacktestPage() {
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
    useToastStore.getState().addToast('success', t('backtest.savedScheme'));
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
    useToastStore.getState().addToast('success', t('backtest.loadedScheme'));
    setShowLoadList(false);
  };

  const handleDeleteConfig = async (id: string) => {
    await deleteNamedConfigApi(id);
    setSavedConfigs(await listNamedConfigs());
  };

  const handleShareLink = async () => {
    const state = useBacktestStore.getState().getShareableState();
    const url = writeStateToURL(state);
    try {
      await navigator.clipboard.writeText(url);
      useToastStore.getState().addToast('success', t('backtest.shareLinkCopied'));
    } catch {
      useToastStore.getState().addToast('success', t('backtest.shareLinkManual'));
    }
  };

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
