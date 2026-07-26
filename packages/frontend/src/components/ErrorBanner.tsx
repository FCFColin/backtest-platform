/**
 * @file ErrorBanner — RFC 7807 错误/告警横幅
 * @description 基于 shadcn Alert 展示错误、警告、降级提示与 503 Retry-After 倒计时。
 *   保持原有 default export 与 props 向后兼容；新增 isDegraded / retryAfter / onClose 为可选能力。
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getErrorI18nKey,
  getWarningI18nKey,
  getWarningInterpolationParams,
  type WarningInfo,
} from '../utils/errorI18nMap.js';

interface ErrorBannerProps {
  /** 自由文本消息（可与 errorCode 共用，附加在 i18n 文案后） */
  message?: ReactNode;
  /** RFC 7807 错误代码，用于查 i18n key 与错误类型 URI */
  errorCode?: string;
  /** 降级/钳制等业务警告 */
  warning?: WarningInfo;
  /** 透传到外层 Alert 的内联样式（保留以兼容旧调用方） */
  style?: CSSProperties;
  /** 视觉变体：error / warning / info */
  variant?: 'error' | 'warning' | 'info';
  /** 降级模式：用 warning 色提示功能受限 */
  isDegraded?: boolean;
  /** 503 Retry-After（秒），传入后展示倒计时 */
  retryAfter?: number;
  /** 传入后渲染右上角关闭按钮 */
  onClose?: () => void;
}

/** 错误类型 URI 的基础前缀（与后端 RFC 7807 error.type 对齐） */
const ERROR_TYPE_BASE = 'https://backtest.platform/errors';

/**
 * 根据 variant 选择 leading 图标与配色类。
 * @param variant - 视觉变体
 * @returns 图标节点与附加 className
 */
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

/** 横幅右上角关闭按钮，多分支复用。 */
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

/** 降级模式横幅：warning 色 + 默认降级文案。 */
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

/** 业务警告横幅：DATE_RANGE_CLAMPED 走 info 色，其余走 warning 色。 */
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

/** 错误码横幅：destructive Alert + 标题 + 描述 + 错误类型 URI + 倒计时。 */
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

/** 纯消息横幅：按 variant 选择图标与配色。 */
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

/**
 * RFC 7807 错误横幅。支持错误码、业务警告、降级模式与 503 倒计时。
 * @param props - 见 ErrorBannerProps
 * @returns 渲染的 Alert 横幅；无内容时返回 null
 */
export default function ErrorBanner({
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

  // 503 Retry-After 倒计时
  useEffect(() => {
    if (!retryAfter || retryAfter <= 0) return;
    setRemaining(retryAfter);
    const id = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [retryAfter]);

  // 降级模式：warning 色 + 默认降级文案
  if (isDegraded) {
    return <DegradedBanner message={message} style={style} onClose={onClose} />;
  }

  // 业务警告
  if (warning) {
    return <WarningBanner warning={warning} style={style} onClose={onClose} />;
  }

  // 错误码模式
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

  // 纯消息模式
  return <MessageBanner message={message} variant={variant} style={style} onClose={onClose} />;
}
