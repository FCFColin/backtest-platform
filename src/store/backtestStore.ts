import { create } from 'zustand';
import type {
  Portfolio,
  Asset,
  BacktestParameters,
  BacktestResult,
  CashflowLeg,
  OneTimeCashflow,
} from '../../shared/types';
import { useToastStore } from './toastStore';

interface BacktestState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  results: BacktestResult | null;
  isLoading: boolean;
  activeTab: string;
  portfolioCounter: number;
  hasLoadedFromShare: boolean;
  _abortController: AbortController | null;

  addPortfolio: () => void;
  addGlidepath: (name: string, fromId: string, toId: string, years: number) => void;
  duplicatePortfolio: (id: string) => void;
  removePortfolio: (id: string) => void;
  addAsset: (portfolioId: string) => void;
  removeAsset: (portfolioId: string, ticker: string) => void;
  updateAsset: (portfolioId: string, assetIndex: number, updates: Partial<Asset>) => void;
  batchUpdateAssets: (portfolioId: string, updates: Array<{ index: number; weight: number }>) => void;
  updatePortfolio: (id: string, updates: Partial<Pick<Portfolio, 'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands' | 'drag' | 'totalReturn' | 'isGlidepath' | 'glidepathFrom' | 'glidepathTo' | 'glidepathYears' | 'glidepathToWeights'>>) => void;
  updateParameter: <K extends keyof BacktestParameters>(key: K, value: BacktestParameters[K]) => void;
  addCashflowLeg: () => void;
  removeCashflowLeg: (id: string) => void;
  updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) => void;
  addOneTimeCashflow: () => void;
  removeOneTimeCashflow: (id: string) => void;
  updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) => void;
  setResults: (results: BacktestResult | null) => void;
  setActiveTab: (tab: string) => void;
  setHasLoadedFromShare: (val: boolean) => void;
  loadFromShare: (data: { portfolios: Portfolio[]; parameters: BacktestParameters }) => void;
  getShareableState: () => { portfolios: Portfolio[]; parameters: BacktestParameters };
  runBacktest: () => Promise<void>;
}

let currentRequestId = 0;

const defaultParameters: BacktestParameters = {
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  baseCurrency: 'usd',
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: 'SPY',
  extendedWithdrawalStats: false,
  cashflowLegs: [],
  oneTimeCashflows: [],
};

const createDefaultPortfolio = (counter: number): Portfolio => {
  return {
    id: `portfolio-${Date.now()}-${counter}`,
    name: `Portfolio ${counter}`,
    assets: [
      { id: `asset-${Date.now()}-1`, ticker: 'VTI', weight: 60 },
      { id: `asset-${Date.now()}-2`, ticker: 'BND', weight: 40 },
    ],
    rebalanceFrequency: 'quarterly',
    rebalanceOffset: 0,
    drag: 0,
    totalReturn: true,
  };
};

export const useBacktestStore = create<BacktestState>((set, get) => ({
  portfolios: [createDefaultPortfolio(1)],
  parameters: defaultParameters,
  results: null,
  isLoading: false,
  activeTab: 'growth',
  portfolioCounter: 1,
  hasLoadedFromShare: false,
  _abortController: null as AbortController | null,

  addPortfolio: () => {
    const next = get().portfolioCounter + 1;
    set((state) => ({
      portfolioCounter: next,
      portfolios: [...state.portfolios, createDefaultPortfolio(next)],
    }));
  },

  addGlidepath: (name, fromId, toId, years) => {
    const next = get().portfolioCounter + 1;
    set((state) => {
      const from = state.portfolios.find((p) => p.id === fromId);
      const to = state.portfolios.find((p) => p.id === toId);
      if (!from || !to) return state;
      // 计算目标权重（小数形式），按from的assets顺序对齐to的权重
      const toWeights: number[] = from.assets.map((fromAsset) => {
        const toAsset = to.assets.find((a) => a.ticker === fromAsset.ticker);
        return toAsset ? toAsset.weight / 100 : 0;
      });
      const gp: Portfolio = {
        id: `glidepath-${Date.now()}-${next}`,
        name,
        assets: from.assets.map((a) => ({ ...a })),
        rebalanceFrequency: from.rebalanceFrequency,
        rebalanceOffset: from.rebalanceOffset,
        drag: from.drag ?? 0,
        totalReturn: from.totalReturn ?? true,
        isGlidepath: true,
        glidepathFrom: fromId,
        glidepathTo: toId,
        glidepathYears: years,
        glidepathToWeights: toWeights,
      };
      return { portfolioCounter: next, portfolios: [...state.portfolios, gp] };
    });
  },

  duplicatePortfolio: (id) => {
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
  },

  removePortfolio: (id) => {
    set((state) => {
      if (state.portfolios.length <= 1) return state;
      return { portfolios: state.portfolios.filter((p) => p.id !== id) };
    });
  },

  addAsset: (portfolioId) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === portfolioId
          ? { ...p, assets: [...p.assets, { id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ticker: '', weight: 0 }] }
          : p
      ),
    }));
  },

  removeAsset: (portfolioId, ticker) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === portfolioId
          ? { ...p, assets: p.assets.filter((a) => a.ticker !== ticker) }
          : p
      ),
    }));
  },

  updateAsset: (portfolioId, assetIndex, updates) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === portfolioId
          ? {
              ...p,
              assets: p.assets.map((a, i) =>
                i === assetIndex ? { ...a, ...updates } : a
              ),
            }
          : p
      ),
    }));
  },

  batchUpdateAssets: (portfolioId, updates) => {
    set(state => ({
      portfolios: state.portfolios.map(p =>
        p.id === portfolioId
          ? { ...p, assets: p.assets.map((a, i) => {
              const u = updates.find(u => u.index === i);
              return u ? { ...a, weight: u.weight } : a;
            })}
          : p
      )
    }))
  },

  updatePortfolio: (id, updates) => {
    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },

  updateParameter: (key, value) => {
    set((state) => ({
      parameters: { ...state.parameters, [key]: value },
    }));
  },

  addCashflowLeg: () => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        cashflowLegs: [
          ...(state.parameters.cashflowLegs || []),
          {
            id: `cf-${Date.now()}`,
            amount: 0,
            type: 'contribution',
            frequency: 'yearly',
            offset: 0,
          },
        ],
      },
    }));
  },

  removeCashflowLeg: (id) => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        cashflowLegs: (state.parameters.cashflowLegs || []).filter((l) => l.id !== id),
      },
    }));
  },

  updateCashflowLeg: (id, updates) => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        cashflowLegs: (state.parameters.cashflowLegs || []).map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      },
    }));
  },

  addOneTimeCashflow: () => {
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
  },

  removeOneTimeCashflow: (id) => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        oneTimeCashflows: (state.parameters.oneTimeCashflows || []).filter((c) => c.id !== id),
      },
    }));
  },

  updateOneTimeCashflow: (id, updates) => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        oneTimeCashflows: (state.parameters.oneTimeCashflows || []).map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    }));
  },

  setResults: (results) => set({ results }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setHasLoadedFromShare: (val) => set({ hasLoadedFromShare: val }),

  loadFromShare: (data) => {
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
  },

  getShareableState: () => {
    const { portfolios, parameters } = get();
    return { portfolios, parameters };
  },

  runBacktest: async () => {
    const requestId = ++currentRequestId;
    const prevController = get()._abortController;
    if (prevController) prevController.abort();
    const controller = new AbortController();
    set({ _abortController: controller, isLoading: true });

    const { portfolios, parameters } = get();

    // 前端快速验证：检查空 ticker
    const allAssets = portfolios.flatMap(p => p.assets);
    const emptyTickers = allAssets.filter(a => !a.ticker.trim());
    if (emptyTickers.length > 0) {
      useToastStore.getState().addToast('warning', '存在未填写的标的代码，请检查后再运行');
      if (requestId === currentRequestId) {
        set({ isLoading: false, _abortController: null });
      }
      return;
    }

    // 检查权重总和（允许浮点误差）
    for (const p of portfolios) {
      const tw = p.assets.reduce((s, a) => s + a.weight, 0);
      if (Math.abs(tw - 100) > 0.01) {
        useToastStore.getState().addToast('warning', `${p.name} 的权重合计为 ${tw.toFixed(2)}%，应为 100%`);
        if (requestId === currentRequestId) {
          set({ isLoading: false, _abortController: null });
        }
        return;
      }
    }

    try {
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch('/api/backtest/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          portfolios: portfolios.map((p) => ({
            name: p.name,
            assets: p.assets,
            rebalanceFrequency: p.rebalanceFrequency,
            rebalanceThreshold: p.rebalanceThreshold,
            rebalanceOffset: p.rebalanceOffset,
            rebalanceBands: p.rebalanceBands,
            drag: p.drag,
            totalReturn: p.totalReturn,
            isGlidepath: p.isGlidepath,
            glidepathToWeights: p.glidepathToWeights,
            glidepathYears: p.glidepathYears,
          })),
          parameters,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const json = await response.json();

      // 后端返回 success: false 表示业务错误（如无效 ticker）
      if (json.success === false) {
        const errorMsg = json.error || '回测运行失败';
        useToastStore.getState().addToast('error', errorMsg);
        set({ results: null });
        return;
      }

      const results = json.data ?? json;

      // 显示后端返回的警告
      if (json.warnings && json.warnings.length > 0) {
        for (const w of json.warnings) {
          useToastStore.getState().addToast('warning', w);
        }
      }

      // 降级模式警告
      if (json.degraded && json.degradedWarning) {
        useToastStore.getState().addToast('warning', json.degradedWarning);
      }

      if (requestId === currentRequestId) {
        set({ results, activeTab: 'summary' });
      }
    } catch (error) {
      if (requestId !== currentRequestId) return;
      console.error('Backtest failed:', error);
      if (error instanceof DOMException && error.name === 'AbortError') {
        useToastStore.getState().addToast('error', '回测请求超时，请稍后重试');
      } else if (error instanceof TypeError) {
        useToastStore.getState().addToast('error', '网络连接失败，请检查后端服务是否运行');
      } else {
        useToastStore.getState().addToast('error', '回测运行失败，请检查标的代码是否正确');
      }
      set({ results: null });
    } finally {
      if (requestId === currentRequestId) {
        set({ isLoading: false, _abortController: null });
      }
    }
  },
}));
