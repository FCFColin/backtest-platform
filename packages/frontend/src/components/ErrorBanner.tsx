import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { getErrorI18nKey, getWarningI18nKey, getWarningInterpolationParams, type WarningInfo } from '../utils/errorReporter.js';
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
        className: 'bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning'
      };
    case 'info':
      return {
        icon: <Info className="size-4" />,
        className: 'bg-brand/10 border-brand/30 text-brand [&>svg]:text-brand'
      };
    case 'error':
    default:
      return {
        icon: <AlertCircle className="size-4" />,
        className: ''
      };
  }
}
function ErrorBannerCloseButton({ onClose, className }: { onClose: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <Button variant="icon" size="icon" onClick={onClose} aria-label={t('common.close')} className={cn('absolute right-2 top-2 h-6 w-6 [&_svg]:size-3.5', className)}>
      <X />
    </Button>
  );
}
function DegradedBanner({ message, style, onClose }: { message?: ReactNode; style?: CSSProperties; onClose?: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert variant="default" className="bg-warning/10 border-warning/30 text-warning [&>svg]:text-warning relative" style={style}>
      <AlertTriangle className="size-4" />
      <AlertTitle className="text-warning">{t('errors.degradedMode')}</AlertTitle>
      <AlertDescription className="text-warning/90">{message ?? t('errors.degradedDefaultWarning')}</AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} />}
    </Alert>
  );
}
function WarningBanner({ warning, style, onClose }: { warning: WarningInfo; style?: CSSProperties; onClose?: () => void }) {
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
function ErrorCodeBanner({ message, errorCode, style, retryAfter, remaining, onClose }: { message?: ReactNode; errorCode: string; style?: CSSProperties; retryAfter?: number; remaining: number; onClose?: () => void }) {
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
              defaultValue: 'Retry in {{seconds}}s'
            })}
          </span>
        )}
        <a href={errorUri} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center text-caption text-danger/80 underline-offset-2 hover:underline">
          {errorUri}
        </a>
      </AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} className="text-danger" />}
    </Alert>
  );
}
function MessageBanner({ message, variant, style, onClose }: { message: ReactNode; variant: 'error' | 'warning' | 'info'; style?: CSSProperties; onClose?: () => void }) {
  const meta = getVariantMeta(variant);
  return (
    <Alert variant={variant === 'error' ? 'destructive' : 'default'} className={cn('relative', meta.className)} style={style}>
      {meta.icon}
      <AlertDescription>{message}</AlertDescription>
      {onClose && <ErrorBannerCloseButton onClose={onClose} />}
    </Alert>
  );
}
export default function ErrorBanner({ message, errorCode, warning, style, variant = 'error', isDegraded, retryAfter, onClose }: ErrorBannerProps) {
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
    return <ErrorCodeBanner message={message} errorCode={errorCode} style={style} retryAfter={retryAfter} remaining={remaining} onClose={onClose} />;
  }
  if (!message) return null;
  return <MessageBanner message={message} variant={variant} style={style} onClose={onClose} />;
}
