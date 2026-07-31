import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useToastStore } from '../store/toastStore.js';
import type { ToastItem } from '../store/toastStore.js';
import { Alert } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
const AUTO_DISMISS_MS: Record<ToastItem['type'], number> = {
  success: 4000,
  warning: 4000,
  error: 6000
};
const FADE_DURATION = 300;
const typeMeta: Record<ToastItem['type'], { icon: typeof CheckCircle2; accent: string; role: 'alert' | 'status'; ariaLive: 'assertive' | 'polite' }> = {
  error: { icon: XCircle, accent: 'border-l-4 border-l-danger', role: 'alert', ariaLive: 'assertive' },
  warning: { icon: AlertTriangle, accent: 'border-l-4 border-l-warning', role: 'alert', ariaLive: 'assertive' },
  success: { icon: CheckCircle2, accent: 'border-l-4 border-l-success', role: 'status', ariaLive: 'polite' }
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
  const meta = typeMeta[toast.type];
  const Icon = meta.icon;
  return (
    <Alert role={meta.role} aria-live={meta.ariaLive} aria-atomic="true" onClick={dismiss} className={cn('cursor-pointer max-w-[380px] w-full transition-all', meta.accent, fading && 'opacity-0 translate-x-5')} style={{ transitionDuration: `${FADE_DURATION}ms` }}>
      <Icon className="size-4" />
      <AlertMessage>{toast.message}</AlertMessage>
    </Alert>
  );
}
function AlertMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-body text-fg">{children}</div>;
}
export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}
