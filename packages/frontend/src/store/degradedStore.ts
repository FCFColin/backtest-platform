import { create } from 'zustand';

interface DegradedState {
  degraded: boolean;
  degradedWarning: string;
  setDegraded: (degraded: boolean, warning?: string) => void;
  clearDegraded: () => void;
}

export const useDegradedStore = create<DegradedState>((set) => ({
  degraded: false,
  degradedWarning: '',
  setDegraded: (degraded, warning = '') => set({ degraded, degradedWarning: warning }),
  clearDegraded: () => set({ degraded: false, degradedWarning: '' }),
}));
