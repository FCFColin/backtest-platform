/**
 * @file 全局提示组件
 * @description 基于全局 store 的 Toast 通知，支持 success/warning/error 类型及自动消失
 */
import { useEffect, useState, useCallback } from 'react';
import { useToastStore } from '../store/toastStore';
import type { ToastItem } from '../store/toastStore';

const AUTO_DISMISS_MS: Record<ToastItem['type'], number> = {
  success: 4000,
  warning: 4000,
  error: 6000,
};

const FADE_DURATION = 300;

const typeStyles: Record<ToastItem['type'], { borderLeftColor: string; background: string }> = {
  error: {
    borderLeftColor: 'var(--danger)',
    background: 'color-mix(in srgb, var(--danger) 10%, var(--bg-elevated))',
  },
  warning: {
    borderLeftColor: 'var(--warning)',
    background: 'color-mix(in srgb, var(--warning) 10%, var(--bg-elevated))',
  },
  success: {
    borderLeftColor: 'var(--success)',
    background: 'color-mix(in srgb, var(--success) 10%, var(--bg-elevated))',
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    setFading(true);
    setTimeout(() => removeToast(toast.id), FADE_DURATION);
  }, [removeToast, toast.id]);

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS[toast.type]);
    return () => clearTimeout(timer);
  }, [dismiss, toast.type]);

  const style = typeStyles[toast.type];

  return (
    <div
      onClick={dismiss}
      style={{
        background: style.background,
        borderLeft: `4px solid ${style.borderLeftColor}`,
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        padding: '12px 20px',
        cursor: 'pointer',
        opacity: fading ? 0 : 1,
        transform: fading ? 'translateX(20px)' : 'translateX(0)',
        transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
        color: 'var(--text-strong)',
        fontSize: '14px',
        lineHeight: '1.5',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {toast.message}
    </div>
  );
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}
