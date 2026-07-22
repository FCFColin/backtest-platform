import type { Portfolio, Asset } from '@backtest/shared';
import { createEmptyPortfolio, createPortfolioFromPreset } from './backtestHelpers.js';
import type { SetFn, GetFn } from './types.js';

function addPortfolioAction(set: SetFn, get: GetFn, presetId?: string): void {
  const next = get().portfolioCounter + 1;
  set((state) => ({
    portfolioCounter: next,
    portfolios: [
      ...state.portfolios,
      presetId ? createPortfolioFromPreset(presetId, next) : createEmptyPortfolio(next),
    ],
  }));
}

function removePortfolioAction(set: SetFn, id: string): void {
  set((state) => ({
    portfolios: state.portfolios.filter((p) => p.id !== id),
  }));
}

function duplicatePortfolioAction(set: SetFn, get: GetFn, id: string): void {
  const next = get().portfolioCounter + 1;
  set((state) => {
    const source = state.portfolios.find((p) => p.id === id);
    if (!source) return state;
    const copy: Portfolio = {
      ...source,
      id: `portfolio-${Date.now()}-${next}`,
      name: `${source.name} (副本)`,
      assets: source.assets.map((a) => ({ ...a })),
    };
    return { portfolioCounter: next, portfolios: [...state.portfolios, copy] };
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

export function portfolioSlice(set: SetFn, _get: GetFn) {
  return {
    portfolios: [],
    portfolioCounter: 0,

    addPortfolio: (presetId?: string) => addPortfolioAction(set, _get, presetId),
    removePortfolio: (id: string) => removePortfolioAction(set, id),
    duplicatePortfolio: (id: string) => duplicatePortfolioAction(set, _get, id),
    addAsset: (portfolioId: string) => addAssetAction(set, portfolioId),
    removeAsset: (portfolioId: string, ticker: string) =>
      removeAssetAction(set, portfolioId, ticker),
    updateAsset: (portfolioId: string, assetIndex: number, updates: Partial<Asset>) =>
      updateAssetAction(set, portfolioId, assetIndex, updates),
    batchUpdateAssets: (portfolioId: string, updates: Array<{ index: number; weight: number }>) =>
      batchUpdateAssetsAction(set, portfolioId, updates),
    updatePortfolio: (
      id: string,
      updates: Partial<
        Pick<
          Portfolio,
          | 'name'
          | 'rebalanceFrequency'
          | 'rebalanceThreshold'
          | 'rebalanceOffset'
          | 'rebalanceBands'
          | 'drag'
          | 'totalReturn'
          | 'isGlidepath'
          | 'glidepathFrom'
          | 'glidepathTo'
          | 'glidepathYears'
          | 'glidepathToWeights'
        >
      >,
    ) =>
      set((state) => ({
        portfolios: state.portfolios.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      })),
  };
}
