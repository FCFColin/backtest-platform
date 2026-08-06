import {
  useState,
  startTransition,
  forwardRef,
  type ElementRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Sun, Languages, MoonStar, X, ArrowRight, Bell, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { useTheme, useAnnouncements } from '@/hooks/miscHooks';
import { useBacktestStore } from '@/store/backtestStore';
import { Button } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const sheetVariants = cva(
  'fixed z-50 gap-4 bg-surface p-6 shadow-lg border-border transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-300',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right:
          'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
    },
    defaultVariants: { side: 'right' },
  },
);
const SheetContent = forwardRef<
  ElementRef<typeof SheetPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-app/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      <SheetPrimitive.Close
        className="absolute right-4 top-4 rounded-sm text-fg-tertiary opacity-70 transition-opacity hover:text-fg hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:pointer-events-none"
        aria-label="Close"
      >
        <X className="size-4" />
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;
const SheetTitle = ({ className, children }: { className?: string; children: ReactNode }) => (
  <SheetPrimitive.Title className={cn('text-h2 text-fg', className)}>
    {children}
  </SheetPrimitive.Title>
);
export { Sheet, SheetTrigger, SheetContent, SheetTitle };

function NotificationBell() {
  const { t } = useTranslation();
  const { announcements, unreadCount, markAllRead } = useAnnouncements();
  const [open, setOpen] = useState(false);
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) markAllRead();
  };
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label="Notifications"
          data-testid="notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-danger animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] p-0">
        <div className="flex flex-col gap-1.5 text-center sm:text-left p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle>{t('Product Updates')}</SheetTitle>
            <span className="text-caption text-fg-tertiary">{t('Latest updates')}</span>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[calc(100dvh-4rem)]">
          {announcements.length === 0 ? (
            <div className="p-8 text-center text-caption text-fg-tertiary">
              {t('No announcements')}
            </div>
          ) : (
            announcements.map((ann) => (
              <div
                key={ann.id}
                className="p-4 border-b border-border-subtle hover:bg-hover/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label-tiny text-fg-tertiary">#{ann.slug}</span>
                  <time className="text-caption text-fg-tertiary font-mono">{ann.publishedAt}</time>
                </div>
                <h4 className="text-body font-semibold mb-1">{ann.title}</h4>
                <p className="text-caption text-fg-secondary leading-relaxed mb-2">{ann.body}</p>
                {ann.ctaLabel && ann.ctaLink && (
                  <Link
                    to={ann.ctaLink}
                    className="text-caption text-brand hover:underline flex items-center gap-1"
                  >
                    {ann.ctaLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function NavbarActions() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const baseCurrency = useBacktestStore(useShallow((s) => s.parameters.baseCurrency));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  const toggleCurrency = () =>
    updateParameter('baseCurrency', baseCurrency === 'usd' ? 'cny' : 'usd');
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="icon"
        size="sm"
        onClick={() =>
          startTransition(
            () => void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN'),
          )
        }
        title={t('Switch Language')}
        aria-label={`${t('Switch Language')} (${i18n.language === 'zh-CN' ? 'ZH' : 'EN'})`}
        className="gap-1 px-2"
        data-testid="language-selector"
      >
        <Languages className="size-4" />
        <span className="text-caption">{i18n.language === 'zh-CN' ? 'ZH' : 'EN'}</span>
      </Button>
      <Button
        variant="icon"
        size="icon"
        onClick={toggleTheme}
        title={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')}
        aria-label={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')}
        data-testid="theme-toggle"
      >
        {theme === 'dark' ? <Sun /> : <MoonStar />}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={toggleCurrency}
        title={t('Switch currency')}
        aria-label={`${t('Switch currency')} (${baseCurrency === 'usd' ? 'USD' : 'CNY'})`}
        data-testid="currency-selector"
      >
        {baseCurrency === 'usd' ? 'USD' : 'CNY'}
        <ChevronDown className="size-3" />
      </Button>
      <div className="w-px h-6 bg-border mx-1" />
      <NotificationBell />
      <div className="w-px h-6 bg-border mx-1" />
      <Link to="/login">
        <Button variant="ghost" size="sm">
          {t('Log In')}
        </Button>
      </Link>
      <Link to="/signup">
        <Button variant="secondary" size="sm">
          {t('Sign Up')}
        </Button>
      </Link>
    </div>
  );
}

type PlanTier = 'free' | 'pro' | 'pro-plus' | 'public';
const PLAN_BADGES: Record<PlanTier, { label: string; className: string }> = {
  free: { label: 'FREE', className: 'border-brand/40 bg-brand-subtle/8 text-brand' },
  pro: { label: 'PRO', className: 'border-warning/40 bg-warning-subtle/8 text-warning' },
  'pro-plus': { label: 'PRO+', className: 'border-success/40 bg-success-subtle/8 text-success' },
  public: { label: 'PUBLIC', className: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary' },
};
export function PlanBadge({ tier, className }: { tier: PlanTier; className?: string }) {
  const { label, className: badgeClass } = PLAN_BADGES[tier];
  return (
    <span
      data-testid="plan-badge"
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider border rounded-full',
        badgeClass,
        className,
      )}
    >
      {label}
    </span>
  );
}

const PROMO_VARIANTS: Record<string, { bar: string; dot: string }> = {
  info: { bar: 'bg-brand-subtle/8 border-brand/20 text-fg', dot: 'bg-brand' },
  success: { bar: 'bg-success-subtle/10 border-success/20 text-fg', dot: 'bg-success' },
  warning: { bar: 'bg-warning-subtle/10 border-warning/20 text-fg', dot: 'bg-warning' },
};
export function PromoBar({
  id,
  message,
  ctaLabel,
  ctaLink,
  variant = 'info',
  dismissible = true,
}: {
  id: string;
  message: string;
  ctaLabel?: string;
  ctaLink?: string;
  variant?: 'info' | 'success' | 'warning';
  dismissible?: boolean;
}) {
  const storageKey = `promo-dismissed-${id}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* noop */
    }
  };
  const v = PROMO_VARIANTS[variant];
  return (
    <div className={cn('h-10 border-b flex items-center', v.bar)}>
      <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-center gap-3">
        <span className={cn('w-2 h-2 rounded-full animate-pulse', v.dot)} />
        <span className="text-body">{message}</span>
        {ctaLabel && ctaLink && (
          <Link
            to={ctaLink}
            className="text-body font-medium text-brand hover:underline flex items-center gap-1"
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="ml-auto p-1 hover:bg-hover rounded-md transition-colors"
            aria-label="Close announcement"
          >
            <X className="h-4 w-4 text-fg-tertiary" />
          </button>
        )}
      </div>
    </div>
  );
}
