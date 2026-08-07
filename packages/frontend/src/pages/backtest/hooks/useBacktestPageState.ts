import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import {
  saveNamedConfigApi,
  listNamedConfigs,
  deleteNamedConfigApi,
  type SavedPortfolio,
} from '@/utils/portfolioStorage';
import { readStateFromURL, writeStateToURL } from '@/utils/portfolioStorage';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import type { BacktestPageState } from '../BacktestPage.js';
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
        useToastStore.getState().addToast('warning', t('Share link data format error'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时从 URL hash 加载分享数据
  }, [loadFromShare, hasLoadedFromShare, setHasLoadedFromShare]);
}
function buildBacktestSeoProps(t: TFunction) {
  return {
    desc: t(
      'This platform is a portfolio backtesting tool supporting ETFs, stocks, funds, synthetic assets and custom series. Compare multiple portfolios over the same historical period, test rebalancing rules, and simulate contributions or withdrawals.\n\nSupports benchmark comparison, total return settings, inflation adjustment, rolling window statistics, and retirement withdrawal simulations.\n\nView drawdowns, rolling returns, correlations, Sharpe ratio, Sortino ratio, Calmar ratio, and detailed retirement withdrawal success rates.',
    ),
    features: [
      {
        title: t('What You Can Model'),
        desc: t(
          'Portfolio weights, date ranges, rebalancing schedules, cashflows, inflation, drag and withdrawal assumptions.',
        ),
      },
      {
        title: t('Metrics You Can Inspect'),
        desc: t(
          'CAGR, MWRR, volatility, max drawdown, Sharpe/Sortino/Calmar ratios, rolling metrics, seasonality, correlations and retirement withdrawal statistics.',
        ),
      },
    ],
    related: [
      { title: t('Monte Carlo'), href: '/monte-carlo' },
      { title: t('nav.portfolioOptimize'), href: '/optimizer' },
      { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
      { title: t('nav.assetAnalysis'), href: '/analysis' },
    ],
    relatedLabel: t('Related Tools:'),
  };
}
export function useBacktestPageState(): BacktestPageState {
  const { t } = useTranslation();
  const seoProps = buildBacktestSeoProps(t);
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
  const handleShareLink = async () => {
    const state = useBacktestStore.getState().getShareableState();
    const url = writeStateToURL(state);
    try {
      await navigator.clipboard.writeText(url);
      useToastStore.getState().addToast('success', t('Share link copied to clipboard'));
    } catch {
      useToastStore
        .getState()
        .addToast('success', t('Share link generated (please copy from address bar manually)'));
    }
  };
  return {
    t,
    seoProps,
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
    handleShareLink,
  };
}
