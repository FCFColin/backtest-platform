import {
  useState,
  useEffect,
  startTransition,
  forwardRef,
  type ElementRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, ChevronDown } from '@/icons/icons.js';
import { Menu, Sun, Languages, MoonStar, X, ArrowRight, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTheme, useAnnouncements } from '@/hooks/miscHooks';
import { useBacktestStore } from '@/store/backtestStore';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/uiComponents';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const navLinkClass =
  'px-3 py-2 text-body font-medium text-fg-secondary hover:text-fg rounded-md hover:bg-hover transition-colors duration-150';
const DIRECT_LINKS = [
  { to: '/data-engine', key: 'dataEngine' },
  { to: '/about', key: 'docs' },
  { to: '/pricing', key: 'pricing' },
] as const;
export const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
      { to: '/lumpsum-vs-dca', key: 'lumpSumDca' },
      { to: '/portfolio-comparison', key: 'portfolioComparison' },
    ],
  },
  {
    key: 'analysisOptimization',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
    ],
  },
  {
    key: 'tacticalSignal',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
      { to: '/letf-slippage', key: 'letfAnalysis' },
      { to: '/calculators', key: 'calculators' },
    ],
  },
] as const;
function NavGroup({
  group,
  isActive,
  isOpen,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  isOpen: boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const groupActive = group.items.some((item) => isActive(item.to));
  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => onToggle(open ? group.key : '')}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-9 px-2.5 text-label text-fg-secondary hover:bg-hover hover:text-fg [&_svg]:size-3',
            groupActive && 'text-fg',
          )}
        >
          {t(`nav.${group.key}`)}
          <ChevronDown
            className={cn('transition-transform duration-150', isOpen && 'rotate-180')}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem] duration-75">
        {group.items.map((item) => {
          const active = isActive(item.to);
          return (
            <DropdownMenuItem asChild key={item.to} className={cn(active && 'text-brand')}>
              <Link to={item.to}>{t(`nav.${item.key}`)}</Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function NavGroupsContainer({
  openGroup,
  isActive,
  onToggle,
  t,
  className,
}: {
  openGroup: string;
  isActive: (to: string) => boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
  className?: string;
}) {
  return (
    <div data-testid="nav-group" className={cn('flex items-center gap-1', className)}>
      {NAV_GROUP_KEYS.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          isActive={isActive}
          isOpen={openGroup === group.key}
          onToggle={onToggle}
          t={t}
        />
      ))}
    </div>
  );
}
function NavbarMobileMenu({
  mobileOpen,
  setMobileOpen,
  openGroup,
  isActive,
  setOpenGroup,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  openGroup: string;
  isActive: (to: string) => boolean;
  setOpenGroup: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild>
        <Button variant="icon" size="icon" className="md:hidden" aria-label={t('nav.menu')}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="text-h2 text-fg">{t('nav.brandName')}</SheetTitle>
        <NavGroupsContainer
          openGroup={openGroup}
          isActive={isActive}
          onToggle={setOpenGroup}
          t={t}
          className="mt-6 flex-col items-stretch gap-1"
        />
        <div className="mt-4 flex flex-col gap-1">
          {DIRECT_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={navLinkClass} data-testid="nav-direct">
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function NavbarActions() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const baseCurrency = useBacktestStore(useShallow((s) => s.parameters.baseCurrency));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  const toggleCurrency = () => {
    updateParameter('baseCurrency', baseCurrency === 'usd' ? 'cny' : 'usd');
  };
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
        title={t('lang.switchLang')}
        aria-label={`${t('lang.switchLang')} (${i18n.language === 'zh-CN' ? 'ZH' : 'EN'})`}
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
        title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
        aria-label={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
        data-testid="theme-toggle"
      >
        {theme === 'dark' ? <Sun /> : <MoonStar />}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={toggleCurrency}
        title={t('lang.switchCurrency')}
        aria-label={`${t('lang.switchCurrency')} (${baseCurrency === 'usd' ? 'USD' : 'CNY'})`}
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
          {t('auth.login.submit')}
        </Button>
      </Link>
      <Link to="/signup">
        <Button variant="secondary" size="sm">
          {t('auth.signup.submit')}
        </Button>
      </Link>
    </div>
  );
}
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
function NotificationBell() {
  const { t } = useTranslation();
  const { announcements, unreadCount, markAllRead } = useAnnouncements();
  const [open, setOpen] = useState(false);
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) {
      markAllRead();
    }
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
            <SheetTitle>{t('notifications.title')}</SheetTitle>
            <span className="text-caption text-fg-tertiary">{t('notifications.latest')}</span>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[calc(100dvh-4rem)]">
          {announcements.length === 0 ? (
            <div className="p-8 text-center text-caption text-fg-tertiary">
              {t('notifications.empty')}
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
export type PlanTier = 'free' | 'pro' | 'pro-plus' | 'public';
interface PlanBadgeProps {
  tier: PlanTier;
  className?: string;
}
const PLAN_BADGES: Record<PlanTier, { label: string; className: string }> = {
  free: { label: 'FREE', className: 'border-brand/40 bg-brand-subtle/8 text-brand' },
  pro: { label: 'PRO', className: 'border-warning/40 bg-warning-subtle/8 text-warning' },
  'pro-plus': { label: 'PRO+', className: 'border-success/40 bg-success-subtle/8 text-success' },
  public: { label: 'PUBLIC', className: 'border-fg-tertiary/40 bg-fg-tertiary/8 text-fg-tertiary' },
};
export function PlanBadge({ tier, className }: PlanBadgeProps) {
  const { label, className: badgeClass } = PLAN_BADGES[tier];
  return (
    <span
      data-testid="plan-badge"
      className={cn(
        'inline-flex items-center px-1.5 py-0.5',
        'text-micro font-semibold uppercase tracking-wider',
        'border rounded-full',
        badgeClass,
        className,
      )}
    >
      {label}
    </span>
  );
}
interface PromoBarProps {
  id: string;
  message: string;
  ctaLabel?: string;
  ctaLink?: string;
  variant?: 'info' | 'success' | 'warning';
  dismissible?: boolean;
}
const PROMO_VARIANTS: Record<
  NonNullable<PromoBarProps['variant']>,
  { bar: string; dot: string }
> = {
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
}: PromoBarProps) {
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
    } catch {
      // 存储不可用时不持久化关闭状态
    }
  };
  if (dismissed) return null;
  return (
    <div className={cn('h-10 border-b flex items-center', PROMO_VARIANTS[variant].bar)}>
      <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-center gap-3">
        <span className={cn('w-2 h-2 rounded-full animate-pulse', PROMO_VARIANTS[variant].dot)} />
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
export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup('');
  }, [location.pathname]);
  const isActive = (to: string) => location.pathname === to;
  return (
    <nav className="sticky top-0 z-50 h-15 border-b border-border-subtle bg-app/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
        <NavbarMobileMenu
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          openGroup={openGroup}
          isActive={isActive}
          setOpenGroup={setOpenGroup}
        />
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-fg transition-colors duration-150 ease-out-quart hover:text-brand"
          >
            <BarChart3 className="size-5 text-brand" />
            <span className="text-h2 font-bold tracking-tight text-fg">{t('nav.brandName')}</span>
          </Link>
          <PlanBadge tier="free" />
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-1">
          <NavGroupsContainer
            openGroup={openGroup}
            isActive={isActive}
            onToggle={setOpenGroup}
            t={t}
          />
          {DIRECT_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={navLinkClass} data-testid="nav-direct">
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>
        <div className="hidden md:block w-px h-6 bg-border" />
        <NavbarActions />
      </div>
    </nav>
  );
}
