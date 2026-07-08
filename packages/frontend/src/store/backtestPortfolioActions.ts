import type {
  Portfolio,
  Asset,
  BacktestParameters,
  CashflowLeg,
  OneTimeCashflow,
} from '@backtest/shared';
import type { BacktestState, SetFn, GetFn } from './backtestStoreTypes.js';
import { createDefaultPortfolio, defaultParameters } from './utils/backtestHelpers.js';

function loadFromShareAction(
  set: SetFn,
  get: GetFn,
  data: { portfolios: Portfolio[]; parameters: BacktestParameters },
): void {
  const maxId = data.portfolios.reduce((max, p) => {
    const match = p.id?.match(/-(\d+)$/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, get().portfolioCounter);
  set({
    portfolios: data.portfolios.map((p) => ({
      ...p,
      id: p.id || `portfolio-${Date.now()}-${maxId + 1}`,
    })),
    parameters: { ...defaultParameters, ...data.parameters },
    results: null,
    activeTab: 'growth' as const,
    portfolioCounter: maxId,
    hasLoadedFromShare: true,
  });
}

function addPortfolioAction(set: SetFn, get: GetFn): void {
  const next = get().portfolioCounter + 1;
  set((state) => ({
    portfolioCounter: next,
    portfolios: [...state.portfolios, createDefaultPortfolio(next)],
  }));
}

function removePortfolioAction(set: SetFn, id: string): void {
  set((state) => {
    if (state.portfolios.length <= 1) return state;
    return { portfolios: state.portfolios.filter((p) => p.id !== id) };
  });
}

function addAssetAction(set: SetFn, portfolioId: string): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId
        ? {
            ...p,
            assets: [
              ...p.assets,
              {
                id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ticker: '',
                weight: 0,
              },
            ],
          }
        : p,
    ),
  }));
}

function removeAssetAction(set: SetFn, portfolioId: string, ticker: string): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, assets: p.assets.filter((a) => a.ticker !== ticker) } : p,
    ),
  }));
}

function updateAssetAction(
  set: SetFn,
  portfolioId: string,
  assetIndex: number,
  updates: Partial<Asset>,
): void {
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId
        ? { ...p, assets: p.assets.map((a, i) => (i === assetIndex ? { ...a, ...updates } : a)) }
        : p,
    ),
  }));
}

function batchUpdateAssetsAction(
  set: SetFn,
  portfolioId: string,
  updates: Array<{ index: number; weight: number }>,
): void {
  const applyBatchUpdates = (assets: Portfolio['assets']) =>
    assets.map((a, i) => {
      const u = updates.find((u) => u.index === i);
      return u ? { ...a, weight: u.weight } : a;
    });
  set((state) => ({
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, assets: applyBatchUpdates(p.assets) } : p,
    ),
  }));
}

function addCashflowLegAction(set: SetFn): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: [
        ...(state.parameters.cashflowLegs || []),
        { id: `cf-${Date.now()}`, amount: 0, type: 'contribution', frequency: 'yearly', offset: 0 },
      ],
    },
  }));
}

function removeCashflowLegAction(set: SetFn, id: string): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: (state.parameters.cashflowLegs || []).filter((l) => l.id !== id),
    },
  }));
}

function updateCashflowLegAction(set: SetFn, id: string, updates: Partial<CashflowLeg>): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      cashflowLegs: (state.parameters.cashflowLegs || []).map((l) =>
        l.id === id ? { ...l, ...updates } : l,
      ),
    },
  }));
}

function addOneTimeCashflowAction(set: SetFn): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: [
        ...(state.parameters.oneTimeCashflows || []),
        {
          id: `otc-${Date.now()}`,
          amount: 0,
          type: 'contribution',
          date: state.parameters.startDate,
        },
      ],
    },
  }));
}

function removeOneTimeCashflowAction(set: SetFn, id: string): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: (state.parameters.oneTimeCashflows || []).filter((c) => c.id !== id),
    },
  }));
}

function updateOneTimeCashflowAction(
  set: SetFn,
  id: string,
  updates: Partial<OneTimeCashflow>,
): void {
  set((state) => ({
    parameters: {
      ...state.parameters,
      oneTimeCashflows: (state.parameters.oneTimeCashflows || []).map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    },
  }));
}

export function createPortfolioActions(
  set: SetFn,
  get: GetFn,
): Pick<
  BacktestState,
  | 'addPortfolio'
  | 'removePortfolio'
  | 'addAsset'
  | 'removeAsset'
  | 'updateAsset'
  | 'batchUpdateAssets'
  | 'updatePortfolio'
  | 'updateParameter'
  | 'addCashflowLeg'
  | 'removeCashflowLeg'
  | 'updateCashflowLeg'
  | 'addOneTimeCashflow'
  | 'removeOneTimeCashflow'
  | 'updateOneTimeCashflow'
  | 'setResults'
  | 'setActiveTab'
  | 'setHasLoadedFromShare'
  | 'loadFromShare'
  | 'getShareableState'
> {
  return {
    addPortfolio: () => addPortfolioAction(set, get),
    removePortfolio: (id) => removePortfolioAction(set, id),
    addAsset: (portfolioId) => addAssetAction(set, portfolioId),
    removeAsset: (portfolioId, ticker) => removeAssetAction(set, portfolioId, ticker),
    updateAsset: (portfolioId, assetIndex, updates) =>
      updateAssetAction(set, portfolioId, assetIndex, updates),
    batchUpdateAssets: (portfolioId, updates) => batchUpdateAssetsAction(set, portfolioId, updates),
    updatePortfolio: (id, updates) =>
      set((state) => ({
        portfolios: state.portfolios.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      })),
    updateParameter: (key, value) =>
      set((state) => ({ parameters: { ...state.parameters, [key]: value } })),
    addCashflowLeg: () => addCashflowLegAction(set),
    removeCashflowLeg: (id) => removeCashflowLegAction(set, id),
    updateCashflowLeg: (id, updates) => updateCashflowLegAction(set, id, updates),
    addOneTimeCashflow: () => addOneTimeCashflowAction(set),
    removeOneTimeCashflow: (id) => removeOneTimeCashflowAction(set, id),
    updateOneTimeCashflow: (id, updates) => updateOneTimeCashflowAction(set, id, updates),
    setResults: (results) => set({ results }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setHasLoadedFromShare: (val) => set({ hasLoadedFromShare: val }),
    loadFromShare: (data) => loadFromShareAction(set, get, data),
    getShareableState: () => {
      const { portfolios, parameters } = get();
      return { portfolios, parameters };
    },
  };
}
