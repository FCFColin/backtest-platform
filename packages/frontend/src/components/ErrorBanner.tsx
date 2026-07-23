import { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getErrorI18nKey,
  getWarningI18nKey,
  getWarningInterpolationParams,
  type WarningInfo,
} from '../utils/errorI18nMap.js';

interface ErrorBannerProps {
  message?: ReactNode;
  errorCode?: string;
  warning?: WarningInfo;
  style?: CSSProperties;
  variant?: 'error' | 'warning' | 'info';
}

const variantStyles: Record<'error' | 'warning' | 'info', CSSProperties> = {
  error: {
    background: '#fee2e2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  warning: {
    background: '#fef3c7',
    border: '1px solid #fde68a',
    color: '#92400e',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  info: {
    background: '#dbeafe',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
};

export default function ErrorBanner({
  message,
  errorCode,
  warning,
  style,
  variant = 'error',
}: ErrorBannerProps) {
  const { t } = useTranslation();

  if (warning) {
    const key = getWarningI18nKey(warning.code);
    const params = getWarningInterpolationParams(warning);
    const colors =
      warning.code === 'DATE_RANGE_CLAMPED' ? variantStyles.info : variantStyles.warning;
    return (
      <div style={{ ...colors, ...style }}>
        {t(key, params)}
        {warning.message ? ` — ${warning.message}` : ''}
      </div>
    );
  }

  if (errorCode) {
    const key = getErrorI18nKey(errorCode);
    return (
      <div style={{ ...variantStyles[variant], ...style }}>
        {t(key)}
        {message && typeof message === 'string' ? ` — ${message}` : ''}
      </div>
    );
  }

  if (!message) return null;

  return <div style={{ ...variantStyles[variant], ...style }}>{message}</div>;
}
