import { useTranslation } from 'react-i18next';
import {
  lazy,
  Suspense,
  useEffect,
  createElement,
  type ReactNode,
  type ComponentType,
} from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { RouteErrorBoundary } from '@/components/errorBoundaries';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Spinner } from '@/components/ui/uiComponents';
import { onNavEnd } from '../utils/performanceReporter.js';
import { PlaceholderPage } from '@/pages/errors/ErrorPages';
import NotFoundPage from '@/pages/errors/ErrorPages';
import { loadNamespace } from '../i18n/index.js';
import { PAGE_LOADERS, type PageName } from './pageLoaders.js';

function NsBoundary({ ns, children }: { ns: string; children: ReactNode }) {
  useEffect(() => {
    loadNamespace(ns).catch(() => {});
  }, [ns]);
  return <>{children}</>;
}

const lazyDefault = (imp: () => Promise<{ default: ComponentType }>) => lazy(imp);
const lazyNamed = <T,>(imp: () => Promise<T>, name: keyof T) =>
  lazy(() =>
    imp().then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, unknown>> })),
  );

const page = (name: PageName) => createElement(PAGE_LOADERS[name]);
const LoginPage = lazyDefault(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazyNamed(() => import('@/pages/auth/LoginPage'), 'SignupPage');
const PricingPage = lazyDefault(() => import('@/pages/account/PricingPage'));
const AccountPage = lazyDefault(() => import('@/pages/account/AccountPage'));
const DataEnginePage = lazyDefault(() => import('@/pages/data-engine/DataEnginePage'));
const DualSignalPage = lazyNamed(
  () => import('@/pages/signal/SignalAnalyzerPage'),
  'DualSignalPage',
);
const MultiSignalPage = lazyNamed(
  () => import('@/pages/signal/SignalAnalyzerPage'),
  'MultiSignalPage',
);
const TacticalGridPage = lazyNamed(
  () => import('@/pages/tactical/TacticalPage'),
  'TacticalGridPage',
);
const AboutPage = lazyNamed(() => import('@/pages/staticPages'), 'AboutPage');
const ContactPage = lazyNamed(() => import('@/pages/staticPages'), 'ContactPage');
const HelpPage = lazyDefault(() => import('@/pages/HelpPage'));
const ChangelogPage = lazyNamed(() => import('@/pages/staticPages'), 'ChangelogPage');
const VerifyEmailPage = lazyDefault(() => import('@/pages/auth/VerifyEmailPage'));
const AcceptInvitePage = lazyNamed(
  () => import('@/pages/auth/VerifyEmailPage'),
  'AcceptInvitePage',
);
const TermsOfServicePage = lazyNamed(
  () => import('@/pages/legal/legalPages'),
  'TermsOfServicePage',
);
const PrivacyPolicyPage = lazyNamed(() => import('@/pages/legal/legalPages'), 'PrivacyPolicyPage');
const DisclaimerPage = lazyNamed(() => import('@/pages/legal/legalPages'), 'DisclaimerPage');
const OrgMembersPage = lazyDefault(() => import('@/pages/OrgMembersPage'));
const BillingPage = lazyDefault(() => import('@/pages/account/BillingPage'));
const AdminLayout = lazyDefault(() => import('@/components/admin/AdminLayout'));
const AdminDashboard = lazyDefault(() => import('@/pages/admin/AdminDashboard'));
const SystemMonitor = lazyDefault(() => import('@/pages/admin/SystemMonitor'));
const DataManagement = lazyDefault(() => import('@/pages/admin/DataManagement'));
const SystemSettings = lazyDefault(() => import('@/pages/admin/SystemSettings'));

function useRouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-20 text-center text-[var(--text-muted)] min-h-[80vh]">
      <Spinner size={8} className="mx-auto mb-4" />
      {t('Loading...')}
    </div>
  );
}

const ANALYSIS_ROUTES = [
  'backtest',
  'analysis',
  'monte-carlo',
  'mc-optimizer',
  'optimizer',
  'efficient-frontier',
  'data-engine',
  'rebalancing-sensitivity',
  'lumpsum-vs-dca',
  'factor-regression',
  'calculators',
  'tactical',
  'tactical-grid',
  'backtest-optimizer',
  'pca',
  'signal-analyzer',
  'dual-signal',
  'multi-signal',
  'letf-slippage',
  'goal-optimizer',
  'portfolio-comparison',
  'chart-benchmark',
];
const ROUTE_NS: Record<string, string> = {
  ...Object.fromEntries(ANALYSIS_ROUTES.map((r) => [r, 'analysis'])),
  ...Object.fromEntries(
    (
      [
        ['pages', ['about', 'contact', 'help', 'changelog', 'pricing', 'limits', 'upgrade']],
        ['auth', ['login', 'signup', 'verify-email', 'accept-invite']],
        ['legal', ['legal-terms', 'legal-privacy', 'legal-disclaimer']],
        ['account', ['account', 'org-members', 'billing']],
        ['admin', ['admin', 'admin-dashboard', 'admin-monitor', 'admin-data', 'admin-settings']],
      ] satisfies Array<[string, string[]]>
    ).flatMap(([ns, keys]) => keys.map((k): [string, string] => [k, ns])),
  ),
  'not-found': 'common',
};

function withBoundary(element: ReactNode, routeName: string): ReactNode {
  return (
    <NsBoundary ns={ROUTE_NS[routeName] ?? 'common'}>
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
  { path: '/analysis', element: page('analysis'), name: 'analysis' },
  { path: '/monte-carlo', element: page('monte-carlo'), name: 'monte-carlo' },
  { path: '/optimizer', element: page('optimizer'), name: 'optimizer' },
  { path: '/efficient-frontier', element: page('efficient-frontier'), name: 'efficient-frontier' },
  { path: '/data-engine', element: <DataEnginePage />, name: 'data-engine' },
  {
    path: '/rebalancing-sensitivity',
    element: page('rebalancing-sensitivity'),
    name: 'rebalancing-sensitivity',
  },
  { path: '/lumpsum-vs-dca', element: page('lumpsum-vs-dca'), name: 'lumpsum-vs-dca' },
  { path: '/factor-regression', element: page('factor-regression'), name: 'factor-regression' },
  { path: '/calculators', element: page('calculators'), name: 'calculators' },
  { path: '/tactical', element: page('tactical'), name: 'tactical' },
  { path: '/tactical-grid', element: <TacticalGridPage />, name: 'tactical-grid' },
  { path: '/backtest-optimizer', element: page('backtest-optimizer'), name: 'backtest-optimizer' },
  { path: '/pca', element: page('pca'), name: 'pca' },
  { path: '/signal-analyzer', element: page('signal-analyzer'), name: 'signal-analyzer' },
  { path: '/dual-signal', element: <DualSignalPage />, name: 'dual-signal' },
  { path: '/multi-signal', element: <MultiSignalPage />, name: 'multi-signal' },
  { path: '/letf-slippage', element: page('letf-slippage'), name: 'letf-slippage' },
  { path: '/goal-optimizer', element: page('goal-optimizer'), name: 'goal-optimizer' },
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
        <Route path="/" element={withBoundary(page('backtest'), 'backtest')} />
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
