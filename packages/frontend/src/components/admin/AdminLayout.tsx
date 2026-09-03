import { useState, type ComponentType, type ReactNode } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/miscHooks.js';
import {
  LayoutDashboard,
  Activity,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ArrowLeft,
  Menu,
  CheckCircle,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardHeader, CardContent, Badge, type BadgeProps } from '../ui/uiComponents.js';
import { cn } from '../../lib/utils.js';
import type { ServiceHealthView } from '../../utils/adminStats.js';
type KpiColor = 'blue' | 'green' | 'purple' | 'orange' | 'red';
const COLOR_CLASSES: Record<KpiColor, string> = {
  blue: 'bg-brand/10 text-brand',
  green: 'bg-success/10 text-success',
  purple: 'bg-[hsl(var(--chart-5))]/15 text-[hsl(var(--chart-5))]',
  orange: 'bg-warning/10 text-warning',
  red: 'bg-danger/10 text-danger',
};
export function KpiCard({
  label,
  value,
  icon,
  color = 'blue',
  subtitle,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  color?: KpiColor;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 p-4 pb-2">
        {icon && <div className={cn('rounded-lg p-2', COLOR_CLASSES[color])}>{icon}</div>}
        <p className="text-caption uppercase tracking-wide text-fg-tertiary">{label}</p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-display tabular-nums font-mono text-fg">{value}</p>
        {subtitle && <p className="mt-1 text-caption text-fg-tertiary">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
const STATUS_CONFIG: Record<
  ServiceStatus,
  {
    icon: typeof CheckCircle;
    badgeVariant: NonNullable<BadgeProps['variant']>;
    overrideClassName?: string;
    labelKey: string;
  }
> = {
  healthy: {
    icon: CheckCircle,
    badgeVariant: 'success',
    labelKey: 'adminPage.monitor.statusHealthy',
  },
  degraded: {
    icon: AlertCircle,
    badgeVariant: 'secondary',
    overrideClassName: 'bg-warning/10 border-warning/20 text-warning',
    labelKey: 'adminPage.monitor.statusDegraded',
  },
  down: {
    icon: XCircle,
    badgeVariant: 'danger',
    labelKey: 'adminPage.dataManagement.statusInactive',
  },
  unknown: {
    icon: AlertCircle,
    badgeVariant: 'secondary',
    overrideClassName: 'bg-elevated text-fg-tertiary',
    labelKey: 'Unknown',
  },
};
export function ServiceStatusBadge({
  status,
  variant = 'pill',
  size = 'sm',
}: {
  status: ServiceStatus;
  variant?: 'pill' | 'dot';
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation(),
    config = STATUS_CONFIG[status],
    Icon = config.icon,
    iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  if (variant === 'dot')
    return (
      <Badge
        variant={config.badgeVariant}
        size="sm"
        role="img"
        aria-label={t(config.labelKey)}
        className={cn('gap-0 px-1', config.overrideClassName)}
      >
        <Icon className={iconSize} aria-hidden="true" />
      </Badge>
    );
  return (
    <Badge variant={config.badgeVariant} size="default" className={config.overrideClassName}>
      <Icon className={iconSize} />
      <span>{t(config.labelKey)}</span>
    </Badge>
  );
}
export function ServiceStatusTable({ services }: { services: ServiceHealthView[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {services.map((service) => (
        <div
          key={service.name}
          className="flex items-center justify-between rounded-lg border border-border-subtle p-3"
        >
          <div>
            <p className="text-sm font-medium text-fg-secondary">{t(service.name)}</p>
            <p className="text-xs text-fg-tertiary">{service.url}</p>
          </div>
          <div className="flex items-center gap-3">
            {service.latency > 0 && (
              <span className="text-xs text-fg-tertiary">{service.latency}ms</span>
            )}
            {service.version && (
              <span className="text-xs text-fg-tertiary">v{service.version}</span>
            )}
            <ServiceStatusBadge status={service.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
const SIDEBAR_ITEMS = [
  { to: '/admin', icon: LayoutDashboard, labelKey: 'adminLayout.dashboard', end: true },
  { to: '/admin/monitor', icon: Activity, labelKey: 'adminLayout.monitor' },
  { to: '/admin/data', icon: Database, labelKey: 'adminLayout.dataManagement' },
  { to: '/admin/settings', icon: Settings, labelKey: 'adminLayout.settings' },
];
export default function AdminLayout() {
  const { t } = useTranslation(),
    [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false),
    location = useLocation(),
    currentItem = SIDEBAR_ITEMS.find((item) =>
      item.end ? location.pathname === '/admin' : location.pathname.startsWith(item.to),
    ),
    currentLabel = currentItem ? t(currentItem.labelKey) : t('Admin Console');
  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      {mobileOpen && (
        <div
          role="button"
          aria-label={t('Close menu')}
          tabIndex={0}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setMobileOpen(false);
            }
          }}
        />
      )}
      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        t={t}
      />
      <div className="flex flex-1 flex-col overflow-hidden bg-app">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            className="rounded p-1.5 hover:bg-hover lg:hidden"
            aria-label={t('adminLayout.openMenu')}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5 text-fg-secondary" />
          </button>
          <h1 className="text-base font-semibold text-fg">{currentLabel}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function AdminSidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  t,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  t: (key: string) => string;
}) {
  const isDesktop = useMediaQuery('(min-width: 1024px)'),
    offscreen = !mobileOpen && !isDesktop;
  return (
    <aside
      aria-hidden={offscreen}
      inert={offscreen ? true : undefined}
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface text-fg-secondary transition-all duration-300 ease-in-out',
        'lg:relative lg:z-auto',
        collapsed ? 'w-16' : 'w-56',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <BarChart3 className="h-5 w-5 shrink-0 text-brand" />
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-fg">{t('Admin Console')}</span>
        )}
        <button
          className="ml-auto hidden rounded p-1 hover:bg-hover lg:block"
          aria-label={collapsed ? t('adminLayout.expandSidebar') : t('adminLayout.collapseSidebar')}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {SIDEBAR_ITEMS.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={t(item.labelKey)}
            collapsed={collapsed}
            end={item.end}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <NavLink
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-tertiary transition-colors hover:bg-hover hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t('Back to Site')}</span>}
        </NavLink>
      </div>
    </aside>
  );
}
function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end,
  onClick,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 mx-2 rounded-md px-2 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-hover text-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
          collapsed && 'justify-center',
        )
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
