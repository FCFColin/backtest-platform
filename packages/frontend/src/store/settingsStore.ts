import { create } from 'zustand';
import type { BaseCurrency } from '@backtest/shared';

const CURRENCY_KEY = 'backtest.currency';

function readCurrency(): BaseCurrency {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'cny' ? 'cny' : 'usd';
  } catch {
    return 'usd';
  }
}

interface SettingsState {
  currency: BaseCurrency;
  setCurrency: (currency: BaseCurrency) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  currency: readCurrency(),
  setCurrency: (currency) => {
    try {
      localStorage.setItem(CURRENCY_KEY, currency);
    } catch {
      // 隐私模式等场景下 localStorage 不可用
    }
    set({ currency });
  },
}));
