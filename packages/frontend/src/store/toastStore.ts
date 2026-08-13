import { create } from 'zustand';
export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
}
interface ToastState {
  toasts: ToastItem[];
  addToast: (type: ToastItem['type'], message: string) => void;
  removeToast: (id: string) => void;
}
let toastCounter = 0;
const MAX_TOASTS = 5;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    // 同文案去重防刷屏（degraded 多标的/重复校验失败），超出上限则丢弃最旧的
    const existing = useToastStore
      .getState()
      .toasts.find((t) => t.type === type && t.message === message);
    if (existing) return;
    toastCounter++;
    const id = `toast-${Date.now()}-${toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), { id, type, message }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
