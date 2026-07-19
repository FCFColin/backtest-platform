/**
 * @file 回测页面状态管理 hook
 * @description 承载 BacktestPage 的全部 state 与副作用：URL 分享加载、保存/加载/删除方案、
 *              生成分享链接、SEO 属性构造。UI 仅消费返回的 state/actions，不直接持有逻辑。
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import type { SavedPortfolio } from '@/utils/portfolioStorage';
import { saveNamedConfigApi, listNamedConfigs, deleteNamedConfigApi } from '@/utils/configApi';
import { readStateFromURL, writeStateToURL } from '@/utils/urlState';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import type { BacktestPageState } from '../BacktestPage.types.js';

/**
 * 挂载时从 URL query / hash / optimizer 跳转载荷加载分享状态。
 * 三种来源按优先级串行判断，命中即加载并通过 toast 反馈。
 */
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

/**
 * 构造 ToolSeoCard 所需属性：描述、可建模/可查看特性、相关工具链接。
 * @param t - i18n 翻译函数
 */
function buildBacktestSeoProps(t: TFunction) {
  return {
    desc: t('backtest.seoDesc'),
    features: [
      { title: t('backtest.seoModelable'), desc: t('backtest.seoModelableDesc') },
      { title: t('backtest.seoViewable'), desc: t('backtest.seoViewableDesc') },
    ],
    related: [
      { title: t('nav.monteCarlo'), href: '/monte-carlo' },
      { title: t('nav.portfolioOptimize'), href: '/optimizer' },
      { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
      { title: t('nav.assetAnalysis'), href: '/analysis' },
    ],
    relatedLabel: t('backtest.relatedTools'),
  };
}

/**
 * 回测页面状态 hook：聚合 store 字段、UI 受控状态与所有副作用回调。
 * @returns BacktestPageState - 主容器与子组件消费的状态/动作集合
 */
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
