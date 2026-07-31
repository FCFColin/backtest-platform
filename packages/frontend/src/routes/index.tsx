import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';
import NsBoundary from '@/components/NsBoundary';
import { onNavEnd } from '../utils/performanceReporter.js';
import PlaceholderPage from '@/pages/PlaceholderPage';
import NotFoundPage from '@/pages/errors/ErrorPages';
const BacktestPage = lazy(() => import('@/pages/backtest/BacktestPage'));
const MonteCarloPage = lazy(() => import('@/pages/monte-carlo/MonteCarloPage'));
const OptimizerPage = lazy(() => import('@/pages/optimizer/OptimizerPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const PricingPage = lazy(() => import('@/pages/account/PricingPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage'));
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
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const ChartBenchmarkPage = lazy(
  () => import('@/pages/prototype/chart-benchmark/ChartBenchmarkPage'),
);
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage'));
const TermsOfServicePage = lazy(() => import('@/pages/legal/TermsOfServicePage'));
const PrivacyPolicyPage = lazy(() => import('@/pages/legal/PrivacyPolicyPage'));
const DisclaimerPage = lazy(() => import('@/pages/legal/DisclaimerPage'));
const OrgMembersPage = lazy(() => import('@/pages/OrgMembersPage'));
const BillingPage = lazy(() => import('@/pages/account/BillingPage'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const SystemMonitor = lazy(() => import('@/pages/admin/SystemMonitor'));
const DataManagement = lazy(() => import('@/pages/admin/DataManagement'));
const SystemSettings = lazy(() => import('@/pages/admin/SystemSettings'));
function useRouteFallback() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: '80px 16px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        minHeight: '80vh',
      }}
    >
      <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-current border-t-transparent rounded-full" />
      {t('toolRoutes.loading')}
    </div>
  );
}
const ROUTE_NS: Record<string, string> = {
  backtest: 'backtest',
  analysis: 'analysis',
  'monte-carlo': 'analysis',
  'mc-optimizer': 'analysis',
  optimizer: 'analysis',
  'efficient-frontier': 'analysis',
  'data-engine': 'analysis',
  'rebalancing-sensitivity': 'analysis',
  'lumpsum-vs-dca': 'analysis',
  'factor-regression': 'analysis',
  calculators: 'analysis',
  tactical: 'analysis',
  'tactical-grid': 'analysis',
  'backtest-optimizer': 'analysis',
  pca: 'analysis',
  'signal-analyzer': 'analysis',
  'dual-signal': 'analysis',
  'multi-signal': 'analysis',
  'letf-slippage': 'analysis',
  'goal-optimizer': 'analysis',
  'portfolio-comparison': 'analysis',
  'chart-benchmark': 'analysis',
  about: 'pages',
  contact: 'pages',
  help: 'pages',
  changelog: 'pages',
  pricing: 'pages',
  limits: 'pages',
  upgrade: 'pages',
  login: 'auth',
  signup: 'auth',
  'verify-email': 'auth',
  'accept-invite': 'auth',
  'legal-terms': 'legal',
  'legal-privacy': 'legal',
  'legal-disclaimer': 'legal',
  account: 'account',
  'org-members': 'account',
  billing: 'account',
  admin: 'admin',
  'admin-dashboard': 'admin',
  'admin-monitor': 'admin',
  'admin-data': 'admin',
  'admin-settings': 'admin',
  'not-found': 'common',
};
function withBoundary(element: ReactNode, routeName: string): ReactNode {
  const ns = ROUTE_NS[routeName] ?? 'common';
  return (
    <NsBoundary ns={ns}>
      <RouteErrorBoundary routeName={routeName}>{element}</RouteErrorBoundary>
    </NsBoundary>
  );
}
function protectedElement(element: ReactNode, routeName: string): ReactNode {
  return withBoundary(<ProtectedRoute>{element}</ProtectedRoute>, routeName);
}
function adminElement(element: ReactNode, routeName: string): ReactNode {
  return withBoundary(<ProtectedRoute requireAdmin>{element}</ProtectedRoute>, routeName);
}
interface RouteDef {
  path: string;
  element: ReactNode;
  name: string;
}
const TOOL_ROUTES: RouteDef[] = [
  { path: '/analysis', element: <AnalysisPage />, name: 'analysis' },
  { path: '/monte-carlo', element: <MonteCarloPage />, name: 'monte-carlo' },
  { path: '/optimizer', element: <OptimizerPage />, name: 'optimizer' },
  { path: '/efficient-frontier', element: <EfficientFrontierPage />, name: 'efficient-frontier' },
  { path: '/data-engine', element: <DataEnginePage />, name: 'data-engine' },
  {
    path: '/rebalancing-sensitivity',
    element: <RebalancingSensitivityPage />,
    name: 'rebalancing-sensitivity',
  },
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
  {
    path: '/portfolio-comparison',
    element: (
      <PlaceholderPage
        titleKey="portfolioComparison.title"
        descKey="portfolioComparison.description"
      />
    ),
    name: 'portfolio-comparison',
  },
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
const LEGAL_ROUTES: RouteDef[] = [
  { path: '/legal/terms', element: <TermsOfServicePage />, name: 'legal-terms' },
  { path: '/legal/privacy', element: <PrivacyPolicyPage />, name: 'legal-privacy' },
  { path: '/legal/disclaimer', element: <DisclaimerPage />, name: 'legal-disclaimer' },
];
const ACCOUNT_ROUTES: RouteDef[] = [
  { path: '/account', element: <AccountPage />, name: 'account' },
  { path: '/org/members', element: <OrgMembersPage />, name: 'org-members' },
  { path: '/billing', element: <BillingPage />, name: 'billing' },
];
function renderRoutes(routes: RouteDef[], protect = false): ReactNode[] {
  return routes.map((r) => (
    <Route
      key={r.path}
      path={r.path}
      element={protect ? protectedElement(r.element, r.name) : withBoundary(r.element, r.name)}
    />
  ));
}
function RouteChangeTracker(): null {
  const location = useLocation();
  useEffect(() => {
    onNavEnd(location.pathname);
  }, [location]);
  return null;
}
export function AppRoutes() {
  const fallback = useRouteFallback();
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={withBoundary(<BacktestPage />, 'backtest')} />
        {renderRoutes(TOOL_ROUTES)}
        {renderRoutes(PUBLIC_ROUTES)}
        {renderRoutes(AUTH_ROUTES)}
        {renderRoutes(LEGAL_ROUTES)}
        {renderRoutes(ACCOUNT_ROUTES, true)}
        <Route path="/admin" element={adminElement(<AdminLayout />, 'admin')}>
          <Route index element={withBoundary(<AdminDashboard />, 'admin-dashboard')} />
          <Route path="monitor" element={withBoundary(<SystemMonitor />, 'admin-monitor')} />
          <Route path="data" element={withBoundary(<DataManagement />, 'admin-data')} />
          <Route path="settings" element={withBoundary(<SystemSettings />, 'admin-settings')} />
        </Route>
        <Route path="*" element={withBoundary(<NotFoundPage />, 'not-found')} />
      </Routes>
      <RouteChangeTracker />
    </Suspense>
  );
}
export default AppRoutes;
