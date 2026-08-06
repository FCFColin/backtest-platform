import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  XCircle,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle, Button } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastItem } from '../store/toastStore.js';
import {
  getErrorI18nKey,
  getWarningI18nKey,
  getWarningInterpolationParams,
  type WarningInfo,
} from '../utils/errorReporter.js';

function CenteredCol({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
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

export function TableEmpty({ message }: { message: string }) {
  return <div className="py-6 text-center text-body text-fg-tertiary">{message}</div>;
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
    <CenteredCol className={className}>
      <Loader2 size={size} className="animate-spin text-fg-tertiary mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </CenteredCol>
  );
}

const BACK_ONLINE_MS = 3000;
export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
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

const ERROR_TYPE_BASE = 'https://backtest.platform/errors';
const VARIANT_META: Record<string, { icon: typeof AlertCircle; cls: string }> = {
  error: { icon: AlertCircle, cls: '' },
  warning: {
    icon: AlertTriangle,
    cls: 'bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning',
  },
  info: { icon: Info, cls: 'bg-brand/10 border-brand/30 text-brand [&>svg]:text-brand' },
};

function CloseBtn({ onClose, className }: { onClose: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="icon"
      size="icon"
      onClick={onClose}
      aria-label={t('Close')}
      className={cn('absolute right-2 top-2 h-6 w-6 [&_svg]:size-3.5', className)}
    >
      <X />
    </Button>
  );
}

export function ErrorBanner({
  message,
  errorCode,
  warning,
  style,
  variant = 'error',
  isDegraded,
  retryAfter,
  onClose,
}: {
  message?: ReactNode;
  errorCode?: string;
  warning?: WarningInfo;
  style?: CSSProperties;
  variant?: 'error' | 'warning' | 'info';
  isDegraded?: boolean;
  retryAfter?: number;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(retryAfter ?? 0);
  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) return;
    setRemaining(retryAfter);
    const id = window.setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [retryAfter]);

  if (isDegraded)
    return (
      <Alert
        variant="default"
        className="bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning relative"
        style={style}
      >
        <AlertTriangle className="size-4" />
        <AlertTitle className="text-warning">{t('Degraded mode:')}</AlertTitle>
        <AlertDescription className="text-warning/90">
          {message ?? t('Some features may be unavailable or using fallback data.')}
        </AlertDescription>
        {onClose && <CloseBtn onClose={onClose} />}
      </Alert>
    );

  if (warning) {
    const meta = VARIANT_META[warning.code === 'DATE_RANGE_CLAMPED' ? 'info' : 'warning'];
    return (
      <Alert variant="default" className={cn('relative', meta.cls)} style={style}>
        {meta.icon && <meta.icon className="size-4" />}
        <AlertDescription>
          {t(getWarningI18nKey(warning.code), getWarningInterpolationParams(warning))}
          {warning.message ? ` - ${warning.message}` : ''}
        </AlertDescription>
        {onClose && <CloseBtn onClose={onClose} />}
      </Alert>
    );
  }

  if (errorCode) {
    const uri = `${ERROR_TYPE_BASE}/${errorCode}`;
    return (
      <Alert variant="destructive" className="relative" style={style}>
        <AlertCircle className="size-4" />
        <AlertTitle>{t(getErrorI18nKey(errorCode))}</AlertTitle>
        <AlertDescription>
          {message && typeof message === 'string' ? ` - ${message}` : message}
          {retryAfter && retryAfter > 0 && (
            <span className="mt-1 flex items-center gap-1 text-danger">
              {t('Retry in {{seconds}}s', {
                seconds: remaining,
                defaultValue: 'Retry in {{seconds}}s',
              })}
            </span>
          )}
          <a
            href={uri}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center text-caption text-danger/80 underline-offset-2 hover:underline"
          >
            {uri}
          </a>
        </AlertDescription>
        {onClose && <CloseBtn onClose={onClose} className="text-danger" />}
      </Alert>
    );
  }

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
      {onClose && <CloseBtn onClose={onClose} />}
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
