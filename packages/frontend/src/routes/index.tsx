/**
 * @file 应用路由聚合 — 单一 <Routes> 块统一管理所有路由。
 * @description 合并自 AuthRoutes / PublicRoutes / AdminRoutes / AccountRoutes / ToolRoutes。
 *   D10-012 修复：原先 5 个独立 <Routes> 块各独立匹配 location，未匹配时 console.warn
 *   "No routes matched location ..."，单页访问产生 8-16 次警告（StrictMode 双渲染）。
 *   改为单一 <Routes> 块后，仅 1 次匹配尝试，未匹配警告降为 0（已定义路由）或 1（未知路径）。
 *   每个路由 element 由 RouteErrorBoundary 包裹，单页 crash 不影响其他路由与 Navbar/Footer。
 *   BacktestPage 保持 eager import，避免首屏 Suspense fallback→真实内容高度突变导致 CLS（C-006）。
 */
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';
// 首屏 BacktestPage eager import：/ 是首页，懒加载会让 Suspense fallback（~150px）
// 切换为真实内容（~800px+）引发 CLS（C-006 实测 0.7788）。eager import 消除该偏移。
import BacktestPage from '@/pages/backtest/BacktestPage';

// 工具页面（懒加载）
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage'));
const MonteCarloPage = lazy(() => import('@/pages/monte-carlo/MonteCarloPage'));
const OptimizerPage = lazy(() => import('@/pages/optimizer/OptimizerPage'));
const EfficientFrontierPage = lazy(
  () => import('@/pages/efficient-frontier/EfficientFrontierPage'),
);
const DataEnginePage = lazy(() => import('@/pages/data-engine/DataEnginePage'));
const RebalancingSensitivityPage = lazy(
  () => import('@/pages/rebalancing-sensitivity/RebalancingSensitivityPage'),
);
const LumpSumVsDCAPage = lazy(() => import('@/pages/lump-sum-dca/LumpSumVsDCAPage'));
const FactorRegressionPage = lazy(() => import('@/pages/factor-regression/FactorRegressionPage'));
const CalculatorsPage = lazy(() => import('@/pages/calculators/CalculatorsPage'));
const TacticalPage = lazy(() => import('@/pages/tactical/TacticalPage'));
const BacktestOptimizerPage = lazy(() => import('@/pages/backtest/BacktestOptimizerPage'));
const PCAPage = lazy(() => import('@/pages/pca/PCAPage'));
const SignalAnalyzerPage = lazy(() => import('@/pages/signal/SignalAnalyzerPage'));
const DualSignalPage = lazy(() => import('@/pages/signal/DualSignalPage'));
const MultiSignalPage = lazy(() => import('@/pages/signal/MultiSignalPage'));
const LETFSlippagePage = lazy(() => import('@/pages/letf/LETFSlippagePage'));
const TacticalGridPage = lazy(() => import('@/pages/tactical/TacticalGridPage'));
const GoalOptimizerPage = lazy(() => import('@/pages/goal-optimizer/GoalOptimizerPage'));

// 公开页面
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const PricingPage = lazy(() => import('@/pages/account/PricingPage'));
const WorkspacePage = lazy(() => import('@/pages/workspace/WorkspacePage'));
const PortfolioComparisonPage = lazy(
  () => import('@/pages/portfolio-comparison/PortfolioComparisonPage'),
);
const SWRPage = lazy(() => import('@/pages/swr/SWRPage'));
const TVMScannerPage = lazy(() => import('@/pages/tvm-scanner/TVMScannerPage'));
const MCOptimizerPage = lazy(() => import('@/pages/monte-carlo/optimizer/MCOptimizerPage'));
const ChartBenchmarkPage = lazy(
  () => import('@/pages/prototype/chart-benchmark/ChartBenchmarkPage'),
);

// 认证页面
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage'));

// 账户页面
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const OrgMembersPage = lazy(() => import('@/pages/OrgMembersPage'));
const BillingPage = lazy(() => import('@/pages/account/BillingPage'));

// 管理页面
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const SystemMonitor = lazy(() => import('@/pages/admin/SystemMonitor'));
const DataManagement = lazy(() => import('@/pages/admin/DataManagement'));
const SystemSettings = lazy(() => import('@/pages/admin/SystemSettings'));

/** 通用懒加载 fallback：spinner + i18n 文案，预留 minHeight 消除 CLS */
function useRouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: '80px 16px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        minHeight: '70vh',
      }}
    >
      <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-current border-t-transparent rounded-full" />
      {t('toolRoutes.loading')}
    </div>
  );
}

/** 用 RouteErrorBoundary 包裹路由 element，提供路由级错误隔离 */
function withBoundary(element: ReactNode, routeName: string): ReactNode {
  return <RouteErrorBoundary routeName={routeName}>{element}</RouteErrorBoundary>;
}

/** 用 ProtectedRoute + RouteErrorBoundary 包裹需登录的路由 element */
function protectedElement(element: ReactNode, routeName: string): ReactNode {
  return withBoundary(<ProtectedRoute>{element}</ProtectedRoute>, routeName);
}

/** 用 ProtectedRoute requireAdmin + RouteErrorBoundary 包裹管理员路由 element */
function adminElement(element: ReactNode, routeName: string): ReactNode {
  return withBoundary(
    <ProtectedRoute requireAdmin>{element}</ProtectedRoute>,
    routeName,
  );
}

interface RouteDef {
  path: string;
  element: ReactNode;
  name: string;
}

const TOOL_ROUTES: RouteDef[] = [
  { path: '/analysis', element: <AnalysisPage />, name: 'analysis' },
  { path: '/monte-carlo', element: <MonteCarloPage />, name: 'monte-carlo' },
  { path: '/monte-carlo/optimizer', element: <MCOptimizerPage />, name: 'mc-optimizer' },
  { path: '/optimizer', element: <OptimizerPage />, name: 'optimizer' },
  { path: '/efficient-frontier', element: <EfficientFrontierPage />, name: 'efficient-frontier' },
  { path: '/data-engine', element: <DataEnginePage />, name: 'data-engine' },
  { path: '/rebalancing-sensitivity', element: <RebalancingSensitivityPage />, name: 'rebalancing-sensitivity' },
  { path: '/lumpsum-vs-dca', element: <LumpSumVsDCAPage />, name: 'lumpsum-vs-dca' },
  { path: '/factor-regression', element: <FactorRegressionPage />, name: 'factor-regression' },
  { path: '/calculators', element: <CalculatorsPage />, name: 'calculators' },
  { path: '/tactical', element: <TacticalPage />, name: 'tactical' },
  { path: '/tactical-grid', element: <TacticalGridPage />, name: 'tactical-grid' },
  { path: '/backtest-optimizer', element: <BacktestOptimizerPage />, name: 'backtest-optimizer' },
  { path: '/pca', element: <PCAPage />, name: 'pca' },
  { path: '/signal-analyzer', element: <SignalAnalyzerPage />, name: 'signal-analyzer' },
  { path: '/dual-signal', element: <DualSignalPage />, name: 'dual-signal' },
  { path: '/multi-signal', element: <MultiSignalPage />, name: 'multi-signal' },
  { path: '/letf-slippage', element: <LETFSlippagePage />, name: 'letf-slippage' },
  { path: '/goal-optimizer', element: <GoalOptimizerPage />, name: 'goal-optimizer' },
  { path: '/portfolio-comparison', element: <PortfolioComparisonPage />, name: 'portfolio-comparison' },
  { path: '/swr', element: <SWRPage />, name: 'swr' },
  { path: '/tvm-scanner', element: <TVMScannerPage />, name: 'tvm-scanner' },
  { path: '/workspace', element: <WorkspacePage />, name: 'workspace' },
  { path: '/prototype/chart-benchmark', element: <ChartBenchmarkPage />, name: 'chart-benchmark' },
];

const PUBLIC_ROUTES: RouteDef[] = [
  { path: '/about', element: <AboutPage />, name: 'about' },
  { path: '/contact', element: <ContactPage />, name: 'contact' },
  { path: '/help', element: <HelpPage />, name: 'help' },
  { path: '/changelog', element: <ChangelogPage />, name: 'changelog' },
  { path: '/pricing', element: <PricingPage />, name: 'pricing' },
  { path: '/limits', element: <AboutPage section="limits" />, name: 'limits' },
  { path: '/upgrade', element: <AboutPage section="upgrade" />, name: 'upgrade' },
];

const AUTH_ROUTES: RouteDef[] = [
  { path: '/login', element: <LoginPage />, name: 'login' },
  { path: '/signup', element: <SignupPage />, name: 'signup' },
  { path: '/verify-email', element: <VerifyEmailPage />, name: 'verify-email' },
  { path: '/accept-invite', element: <AcceptInvitePage />, name: 'accept-invite' },
];

const ACCOUNT_ROUTES: RouteDef[] = [
  { path: '/account', element: <AccountPage />, name: 'account' },
  { path: '/org/members', element: <OrgMembersPage />, name: 'org-members' },
  { path: '/billing', element: <BillingPage />, name: 'billing' },
];

/** 将路由定义数组渲染为带错误边界的 <Route> 列表 */
function renderRoutes(routes: RouteDef[], protect = false): ReactNode[] {
  return routes.map((r) => (
    <Route
      key={r.path}
      path={r.path}
      element={protect ? protectedElement(r.element, r.name) : withBoundary(r.element, r.name)}
    />
  ));
}

/**
 * 应用统一路由组件。
 *
 * 单一 `<Routes>` 块承载全部路由（工具 24 + 公开 7 + 认证 4 + 账户 3 + 管理 5 + 首页 + 兜底）。
 * 消除原 5 个独立 `<Routes>` 块导致的 "No routes matched" 警告刷屏（D10-012）。
 * 每个路由 element 由 RouteErrorBoundary 包裹，单页 crash 仅影响当前路由。
 *
 * @returns 应用路由元素。
 */
export function AppRoutes() {
  const fallback = useRouteFallback();
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={withBoundary(<BacktestPage />, 'backtest')} />
        {renderRoutes(TOOL_ROUTES)}
        {renderRoutes(PUBLIC_ROUTES)}
        {renderRoutes(AUTH_ROUTES)}
        {renderRoutes(ACCOUNT_ROUTES, true)}
        <Route path="/admin" element={adminElement(<AdminLayout />, 'admin')}>
          <Route index element={withBoundary(<AdminDashboard />, 'admin-dashboard')} />
          <Route path="monitor" element={withBoundary(<SystemMonitor />, 'admin-monitor')} />
          <Route path="data" element={withBoundary(<DataManagement />, 'admin-data')} />
          <Route path="settings" element={withBoundary(<SystemSettings />, 'admin-settings')} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;