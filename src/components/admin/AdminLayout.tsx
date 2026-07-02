/**
 * @file 管理后台布局
 * @description 管理后台外壳布局，包含可折叠侧边栏导航及内容区域 Outlet
 */
import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Database,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ArrowLeft,
  Menu,
} from 'lucide-react';

const SIDEBAR_ITEMS = [
  { to: '/admin', icon: LayoutDashboard, label: '仪表盘', end: true },
  { to: '/admin/monitor', icon: Activity, label: '系统监控' },
  { to: '/admin/data', icon: Database, label: '数据管理' },
  { to: '/admin/history', icon: History, label: '回测历史' },
  { to: '/admin/settings', icon: Settings, label: '系统配置' },
];

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const currentLabel =
    SIDEBAR_ITEMS.find((item) => {
      if (item.end) return location.pathname === '/admin';
      return location.pathname.startsWith(item.to);
    })?.label ?? '管理后台';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
          <button
            className="rounded p-1.5 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-base font-semibold text-slate-800">{currentLabel}</h1>
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
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-slate-300
        transition-all duration-300 ease-in-out
        lg:relative lg:z-auto
        ${collapsed ? 'w-16' : 'w-56'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      <div className="flex h-14 items-center gap-2 border-b border-slate-700/60 px-3">
        <BarChart3 className="h-5 w-5 shrink-0 text-blue-400" />
        {!collapsed && <span className="text-sm font-bold tracking-wide text-white">管理后台</span>}
        <button
          className="ml-auto hidden rounded p-1 hover:bg-slate-700 lg:block"
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
            label={item.label}
            collapsed={collapsed}
            end={item.end}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>
      <div className="border-t border-slate-700/60 p-2">
        <NavLink
          to="/"
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span>返回主站</span>}
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
  icon: React.ComponentType<{ className?: string }>;
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
        `flex items-center gap-3 mx-2 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        } ${collapsed ? 'justify-center' : ''}`
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
