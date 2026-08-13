import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { BarChart3, ChevronDown } from 'lucide-react';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { preloadPage } from '@/routes/pageLoaders.js';
import { useAuthStore } from '@/store/authStore';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  NavbarActions,
  PlanBadge,
} from './navbarParts.js';
import { planTier } from '@/utils/orgPlan';

const navLinkClass =
  'px-3 py-2 text-body font-medium text-fg-secondary hover:text-fg rounded-md hover:bg-hover transition-colors duration-150';
const DIRECT_LINKS = [
  { to: '/data-engine', key: 'dataEngine' },
  { to: '/about', key: 'about' },
  { to: '/pricing', key: 'pricing' },
] as const;
const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
      { to: '/lumpsum-vs-dca', key: 'lumpsumVsDca' },
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

function preloadGroup(group: (typeof NAV_GROUP_KEYS)[number]): void {
  for (const item of group.items) preloadPage(item.to === '/' ? 'backtest' : item.to.slice(1));
}

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
            groupActive && 'text-brand',
          )}
          onMouseEnter={() => {
            preloadGroup(group);
          }}
        >
          {t(`nav.${group.key}`)}
          <ChevronDown
            className={cn('transition-transform duration-150', isOpen && 'rotate-180')}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem] duration-75">
        {group.items.map((item) => (
          <DropdownMenuItem asChild key={item.to} className={cn(isActive(item.to) && 'text-brand')}>
            <Link to={item.to} aria-current={isActive(item.to) ? 'page' : undefined}>
              {t(`nav.${item.key}`)}
            </Link>
          </DropdownMenuItem>
        ))}
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
        <Button variant="icon" size="icon" className="md:hidden" aria-label={t('Menu')}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="text-h2 text-fg">{t('Backtest Platform')}</SheetTitle>
        <NavGroupsContainer
          openGroup={openGroup}
          isActive={isActive}
          onToggle={setOpenGroup}
          t={t}
          className="mt-6 flex-col items-stretch gap-1"
        />
        <div className="mt-4 flex flex-col gap-1">
          {DIRECT_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(navLinkClass, isActive(link.to) && 'text-brand')}
              aria-current={isActive(link.to) ? 'page' : undefined}
              data-testid="nav-direct"
            >
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { PromoBar } from './navbarParts.js';
export { PlanBadge } from './navbarParts.js';

export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();
  const org = useAuthStore((s) => s.org);
  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup('');
  }, [location.pathname]);
  const isActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));
  return (
    <nav className="sticky top-0 z-50 h-15 border-b border-border-subtle bg-app/95 backdrop-blur-md">
      <div className="page-container h-full flex items-center gap-4">
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
            <span className="text-h2 font-bold tracking-tight text-fg">
              {t('Backtest Platform')}
            </span>
          </Link>
          <PlanBadge tier={planTier(org?.plan)} />
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
            <Link
              key={link.to}
              to={link.to}
              className={cn(navLinkClass, isActive(link.to) && 'text-brand')}
              aria-current={isActive(link.to) ? 'page' : undefined}
              data-testid="nav-direct"
            >
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
