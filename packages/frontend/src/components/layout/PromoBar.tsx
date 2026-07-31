import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
interface PromoBarProps {
  id: string;
  message: string;
  ctaLabel?: string;
  ctaLink?: string;
  variant?: 'info' | 'success' | 'warning';
  dismissible?: boolean;
}
const VARIANT_STYLES = {
  info: 'bg-brand-subtle/8 border-brand/20 text-fg',
  success: 'bg-success-subtle/10 border-success/20 text-fg',
  warning: 'bg-warning-subtle/10 border-warning/20 text-fg'
} as const;
const DOT_STYLES = {
  info: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning'
} as const;
export function PromoBar({ id, message, ctaLabel, ctaLink, variant = 'info', dismissible = true }: PromoBarProps) {
  const storageKey = `promo-dismissed-${id}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {}
  };
  if (dismissed) return null;
  return (
    <div className={cn('h-10 border-b flex items-center', VARIANT_STYLES[variant])}>
      <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-center gap-3">
        <span className={cn('w-2 h-2 rounded-full animate-pulse', DOT_STYLES[variant])} />
        <span className="text-body">{message}</span>
        {ctaLabel && ctaLink && (
          <Link to={ctaLink} className="text-body font-medium text-brand hover:underline flex items-center gap-1">
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {dismissible && (
          <button onClick={handleDismiss} className="ml-auto p-1 hover:bg-hover rounded-md transition-colors" aria-label="Close announcement">
            <X className="h-4 w-4 text-fg-tertiary" />
          </button>
        )}
      </div>
    </div>
  );
}
