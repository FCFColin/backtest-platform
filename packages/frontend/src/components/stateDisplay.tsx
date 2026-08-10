import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastItem } from '../store/toastStore.js';

function CenteredCol({
  children,
  className,
  role,
  'aria-live': ariaLive,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
  'aria-live'?: 'polite';
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
      role={role}
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <CenteredCol className={className}>
      {Icon && <Icon className="size-12 text-fg-tertiary mb-4" />}
      <h2 className="text-h2 text-fg">{title}</h2>
      {description && <p className="text-body text-fg-secondary mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </CenteredCol>
  );
}

export function TableEmpty({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn('py-6 text-center text-body text-fg-tertiary', className)}>{message}</div>
  );
}

export function LoadingState({
  label,
  size = 32,
  className,
}: {
  label?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <CenteredCol role="status" aria-live="polite" className={className}>
      <Loader2 size={size} className="animate-spin text-fg-tertiary mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </CenteredCol>
  );
}

const BACK_ONLINE_MS = 3000;
export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(typeof window !== 'undefined' && !navigator.onLine);
  const [justCameBack, setJustCameBack] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const on = () => {
      setIsOffline(false);
      setJustCameBack(true);
      timerRef.current = window.setTimeout(() => setJustCameBack(false), BACK_ONLINE_MS);
    };
    const off = () => {
      setIsOffline(true);
      setJustCameBack(false);
    };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, []);
  if (!isOffline && !justCameBack) return null;
  const isBack = !isOffline && justCameBack;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-body text-white',
        isBack ? 'bg-success' : 'bg-danger',
      )}
    >
      {isBack ? (
        <Wifi className="size-4" aria-hidden="true" />
      ) : (
        <WifiOff className="size-4" aria-hidden="true" />
      )}
      <span>
        {isBack
          ? t('Back online')
          : t('You are currently offline. Some features may be unavailable.')}
      </span>
    </div>
  );
}

const VARIANT_META: Record<string, { icon: typeof AlertCircle; cls: string }> = {
  error: { icon: AlertCircle, cls: '' },
  warning: {
    icon: AlertTriangle,
    cls: 'bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning',
  },
  info: { icon: Info, cls: 'bg-brand/10 border-brand/30 text-brand [&>svg]:text-brand' },
};

export function ErrorBanner({
  message,
  style,
  variant = 'error',
}: {
  message?: ReactNode;
  style?: CSSProperties;
  variant?: 'error' | 'warning' | 'info';
}) {
  if (!message) return null;
  const meta = VARIANT_META[variant];
  return (
    <Alert
      variant={variant === 'error' ? 'destructive' : 'default'}
      className={cn('relative', meta.cls)}
      style={style}
    >
      {meta.icon && <meta.icon className="size-4" />}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

const AUTO_DISMISS_MS: Record<ToastItem['type'], number> = {
  success: 4000,
  warning: 4000,
  error: 6000,
};
const FADE_DURATION = 300;
const TYPE_META: Record<
  ToastItem['type'],
  {
    icon: typeof CheckCircle2;
    accent: string;
    role?: 'alert' | 'status';
    ariaLive?: 'assertive' | 'polite';
  }
> = {
  error: { icon: XCircle, accent: 'border-l-4 border-l-danger' },
  warning: { icon: AlertTriangle, accent: 'border-l-4 border-l-warning' },
  success: {
    icon: CheckCircle2,
    accent: 'border-l-4 border-l-success',
    role: 'status',
    ariaLive: 'polite',
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
    const t = setTimeout(dismiss, AUTO_DISMISS_MS[toast.type]);
    return () => clearTimeout(t);
  }, [dismiss, toast.type]);
  const meta = TYPE_META[toast.type];
  const Icon = meta.icon;
  const role = meta.role ?? 'alert';
  const ariaLive = meta.ariaLive ?? 'assertive';
  return (
    <Alert
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      onClick={dismiss}
      className={cn(
        'cursor-pointer max-w-[380px] w-full transition-all',
        meta.accent,
        fading && 'opacity-0 translate-x-5',
      )}
      style={{ transitionDuration: `${FADE_DURATION}ms` }}
    >
      <Icon className="size-4" />
      <div className="text-body text-fg">{toast.message}</div>
    </Alert>
  );
}

export function Toast() {
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
