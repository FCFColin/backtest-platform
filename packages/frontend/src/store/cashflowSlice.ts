import type { Portfolio, CashflowLeg, OneTimeCashflow } from '@backtest/shared';
import type { SetFn, GetFn } from './types.js';

interface AddGlidepathOpts {
  set: SetFn;
  get: GetFn;
  name: string;
  fromId: string;
  toId: string;
  years: number;
}

function addGlidepathAction(opts: AddGlidepathOpts): void {
  const { set, get, name, fromId, toId, years } = opts;
  const next = get().portfolioCounter + 1;
  set((state) => {
    const from = state.portfolios.find((p) => p.id === fromId);
    const to = state.portfolios.find((p) => p.id === toId);
    if (!from || !to) return state;
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

export function cashflowSlice(set: SetFn, get: GetFn) {
  return {
    addGlidepath: (name: string, fromId: string, toId: string, years: number) =>
      addGlidepathAction({ set, get, name, fromId, toId, years }),
    addCashflowLeg: () => addCashflowLegAction(set),
    removeCashflowLeg: (id: string) => removeCashflowLegAction(set, id),
    updateCashflowLeg: (id: string, updates: Partial<CashflowLeg>) =>
      updateCashflowLegAction(set, id, updates),
    addOneTimeCashflow: () => addOneTimeCashflowAction(set),
    removeOneTimeCashflow: (id: string) => removeOneTimeCashflowAction(set, id),
    updateOneTimeCashflow: (id: string, updates: Partial<OneTimeCashflow>) =>
      updateOneTimeCashflowAction(set, id, updates),
  };
}
