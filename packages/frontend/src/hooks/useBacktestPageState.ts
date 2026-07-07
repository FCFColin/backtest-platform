import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { type SavedPortfolio } from '@/utils/portfolioStorage';
import { saveNamedConfigApi, listNamedConfigs, deleteNamedConfigApi } from '@/utils/configApi';
import { readStateFromURL, writeStateToURL } from '@/utils/urlState';
import type { Portfolio, BacktestParameters } from '@backtest/shared';

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
  }, [t, loadFromShare, hasLoadedFromShare, setHasLoadedFromShare]);
}

export function useBacktestPageState() {
  const { t } = useTranslation();

  const [showSaveInput, setShowSaveInput] = useState(false);
  const [configName, setConfigName] = useState('');
  const [showLoadList, setShowLoadList] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedPortfolio[]>([]);

  useUrlShareLoader();

  const handleSaveConfig = useCallback(async () => {
    const name = configName.trim();
    if (!name) return;
    const { portfolios, parameters } = useBacktestStore.getState();
    await saveNamedConfigApi(name, portfolios, parameters);
    useToastStore.getState().addToast('success', t('backtest.savedScheme'));
    setConfigName('');
    setShowSaveInput(false);
  }, [configName, t]);

  const handleOpenLoadList = useCallback(async () => {
    const next = !showLoadList;
    setShowLoadList(next);
    setShowSaveInput(false);
    if (next) setSavedConfigs(await listNamedConfigs());
  }, [showLoadList]);

  const handleLoadConfig = useCallback(
    (config: SavedPortfolio) => {
      useBacktestStore
        .getState()
        .loadFromShare({ portfolios: config.portfolios, parameters: config.parameters });
      useToastStore.getState().addToast('success', t('backtest.loadedScheme'));
      setShowLoadList(false);
    },
    [t],
  );

  const handleDeleteConfig = useCallback(async (id: string) => {
    await deleteNamedConfigApi(id);
    setSavedConfigs(await listNamedConfigs());
  }, []);

  const handleShareLink = useCallback(async () => {
    const state = useBacktestStore.getState().getShareableState();
    const url = writeStateToURL(state);
    try {
      await navigator.clipboard.writeText(url);
      useToastStore.getState().addToast('success', t('backtest.shareLinkCopied'));
    } catch {
      useToastStore.getState().addToast('success', t('backtest.shareLinkManual'));
    }
  }, [t]);

  return {
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
