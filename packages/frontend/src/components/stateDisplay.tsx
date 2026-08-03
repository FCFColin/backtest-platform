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

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
    >
      {Icon && <Icon className="size-12 text-fg-tertiary mb-4" />}
      <h2 className="text-h2 text-fg">{title}</h2>
      {description && <p className="text-body text-fg-secondary mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}
function LoadingSpinner({ size = 24, className }: LoadingSpinnerProps) {
  return <Loader2 size={size} className={cn('animate-spin text-fg-tertiary', className)} />;
}
interface LoadingStateProps {
  label?: ReactNode;
  size?: number;
  className?: string;
}
export function LoadingState({ label, size = 32, className }: LoadingStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
    >
      <LoadingSpinner size={size} className="mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </div>
  );
}

const BACK_ONLINE_DURATION_MS = 3000;
export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [justCameBack, setJustCameBack] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setJustCameBack(false);
    };
    const handleOnline = () => {
      setIsOffline(false);
      setJustCameBack(true);
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setJustCameBack(false), BACK_ONLINE_DURATION_MS);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);
  if (!isOffline && !justCameBack) return null;
  const isBack = !isOffline && justCameBack;
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isBack
          ? 'flex items-center justify-center gap-2 bg-success px-4 py-2 text-body text-white'
          : 'flex items-center justify-center gap-2 bg-danger px-4 py-2 text-body text-white'
      }
    >
      {isBack ? (
        <Wifi className="size-4" aria-hidden="true" />
      ) : (
        <WifiOff className="size-4" aria-hidden="true" />
      )}
      <span>{isBack ? t('common.backOnline') : t('common.offlineBanner')}</span>
    </div>
  );
}

interface ErrorBannerProps {
  message?: ReactNode;
  errorCode?: string;
  warning?: WarningInfo;
  style?: CSSProperties;
  variant?: 'error' | 'warning' | 'info';
  isDegraded?: boolean;
  retryAfter?: number;
  onClose?: () => void;
}
const ERROR_TYPE_BASE = 'https://backtest.platform/errors';
function getVariantMeta(variant: 'error' | 'warning' | 'info') {
  switch (variant) {
    case 'warning':
      return {
        icon: <AlertTriangle className="size-4" />,
        className: 'bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning',
      };
    case 'info':
      return {
        icon: <Info className="size-4" />,
        className: 'bg-brand/10 border-brand/30 text-brand [&>svg]:text-brand',
      };
    case 'error':
    default:
      return {
        icon: <AlertCircle className="size-4" />,
        className: '',
      };
  }
}
function ErrorBannerCloseButton({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="icon"
      size="icon"
      onClick={onClose}
      aria-label={t('common.close')}
      className={cn('absolute right-2 top-2 h-6 w-6 [&_svg]:size-3.5', className)}
    >
      <X />
    </Button>
  );
}
function DegradedBanner({
  message,
  style,
  onClose,
}: {
  message?: ReactNode;
  style?: CSSProperties;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Alert
      variant="default"
      className="bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning relative"
      style={style}
    >
      <AlertTriangle className="size-4" />
      <AlertTitle className="text-warning">{t('errors.degradedMode')}</AlertTitle>
      <AlertDescription className="text-warning/90">
        {message ?? t('errors.degradedDefaultWarning')}
      </AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} />}
    </Alert>
  );
}
function WarningBanner({
  warning,
  style,
  onClose,
}: {
  warning: WarningInfo;
  style?: CSSProperties;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const key = getWarningI18nKey(warning.code);
  const params = getWarningInterpolationParams(warning);
  const meta = getVariantMeta(warning.code === 'DATE_RANGE_CLAMPED' ? 'info' : 'warning');
  return (
    <Alert variant="default" className={cn('relative', meta.className)} style={style}>
      {meta.icon}
      <AlertDescription>
        {t(key, params)}
        {warning.message ? ` - ${warning.message}` : ''}
      </AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} />}
    </Alert>
  );
}
function ErrorCodeBanner({
  message,
  errorCode,
  style,
  retryAfter,
  remaining,
  onClose,
}: {
  message?: ReactNode;
  errorCode: string;
  style?: CSSProperties;
  retryAfter?: number;
  remaining: number;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const key = getErrorI18nKey(errorCode);
  const errorUri = `${ERROR_TYPE_BASE}/${errorCode}`;
  return (
    <Alert variant="destructive" className="relative" style={style}>
      <AlertCircle className="size-4" />
      <AlertTitle>{t(key)}</AlertTitle>
      <AlertDescription>
        {message && typeof message === 'string' ? ` - ${message}` : message}
        {retryAfter && retryAfter > 0 && (
          <span className="mt-1 flex items-center gap-1 text-danger">
            {t('errors.retryIn', {
              seconds: remaining,
              defaultValue: 'Retry in {{seconds}}s',
            })}
          </span>
        )}
        <a
          href={errorUri}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center text-caption text-danger/80 underline-offset-2 hover:underline"
        >
          {errorUri}
        </a>
      </AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} className="text-danger" />}
    </Alert>
  );
}
function MessageBanner({
  message,
  variant,
  style,
  onClose,
}: {
  message: ReactNode;
  variant: 'error' | 'warning' | 'info';
  style?: CSSProperties;
  onClose?: () => void;
}) {
  const meta = getVariantMeta(variant);
  return (
    <Alert
      variant={variant === 'error' ? 'destructive' : 'default'}
      className={cn('relative', meta.className)}
      style={style}
    >
      {meta.icon}
      <AlertDescription>{message}</AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} />}
    </Alert>
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
}: ErrorBannerProps) {
  const [remaining, setRemaining] = useState(retryAfter ?? 0);
  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) return;
    setRemaining(retryAfter);
    const id = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [retryAfter]);
  if (isDegraded) {
    return <DegradedBanner message={message} style={style} onClose={onClose} />;
  }
  if (warning) {
    return <WarningBanner warning={warning} style={style} onClose={onClose} />;
  }
  if (errorCode) {
    return (
      <ErrorCodeBanner
        message={message}
        errorCode={errorCode}
        style={style}
        retryAfter={retryAfter}
        remaining={remaining}
        onClose={onClose}
      />
    );
  }
  if (!message) return null;
  return <MessageBanner message={message} variant={variant} style={style} onClose={onClose} />;
}

const AUTO_DISMISS_MS: Record<ToastItem['type'], number> = {
  success: 4000,
  warning: 4000,
  error: 6000,
};
const FADE_DURATION = 300;
const typeMeta: Record<
  ToastItem['type'],
  {
    icon: typeof CheckCircle2;
    accent: string;
    role: 'alert' | 'status';
    ariaLive: 'assertive' | 'polite';
  }
> = {
  error: {
    icon: XCircle,
    accent: 'border-l-4 border-l-danger',
    role: 'alert',
    ariaLive: 'assertive',
  },
  warning: {
    icon: AlertTriangle,
    accent: 'border-l-4 border-l-warning',
    role: 'alert',
    ariaLive: 'assertive',
  },
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
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS[toast.type]);
    return () => clearTimeout(timer);
  }, [dismiss, toast.type]);
  const meta = typeMeta[toast.type];
  const Icon = meta.icon;
  return (
    <Alert
      role={meta.role}
      aria-live={meta.ariaLive}
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
      <AlertMessage>{toast.message}</AlertMessage>
    </Alert>
  );
}
function AlertMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-body text-fg">{children}</div>;
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
