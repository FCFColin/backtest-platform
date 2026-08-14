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

export type ThemePref = 'light' | 'dark' | 'system';
const THEMES: ThemePref[] = ['light', 'dark', 'system'];

function readTheme(): ThemePref {
  try {
    const stored = localStorage.getItem('theme') as ThemePref | null;
    return THEMES.includes(stored as ThemePref) ? (stored as ThemePref) : 'system';
  } catch {
    return 'system';
  }
}

function persistTheme(theme: ThemePref) {
  try {
    if (theme === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch {
    // 隐私模式等场景下 localStorage 不可用
  }
}

interface SettingsState {
  currency: BaseCurrency;
  setCurrency: (currency: BaseCurrency) => void;
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  toggleTheme: () => void;
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
  theme: readTheme(),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const next = THEMES[(THEMES.indexOf(s.theme) + 1) % THEMES.length];
      persistTheme(next);
      return { theme: next };
    }),
}));
