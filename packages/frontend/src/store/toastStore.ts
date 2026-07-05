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

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message) => {
    toastCounter++;
    const id = `toast-${Date.now()}-${toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
