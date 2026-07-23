/**
 * 应用路由聚合 — 认证/公开/账户/管理/工具五大路由组统一导出。
 *
 * 合并自 AuthRoutes / PublicRoutes / AdminRoutes / AccountRoutes / ToolRoutes。
 */
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';

// 工具页面
const BacktestPage = lazy(() => import('@/pages/backtest/BacktestPage'));
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

const simpleFallback = (
  <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
    {/* loading */}
  </div>
);

export function AuthRoutes() {
  return (
    <Suspense fallback={simpleFallback}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
      </Routes>
    </Suspense>
  );
}

export function PublicRoutes() {
  return (
    <Suspense fallback={simpleFallback}>
      <Routes>
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/limits" element={<AboutPage section="limits" />} />
        <Route path="/upgrade" element={<AboutPage section="upgrade" />} />
      </Routes>
    </Suspense>
  );
}

export function AdminRoutes() {
  return (
    <Suspense fallback={simpleFallback}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="monitor" element={<SystemMonitor />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function AccountRoutes() {
  return (
    <Suspense fallback={simpleFallback}>
      <Routes>
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/org/members"
          element={
            <ProtectedRoute>
              <OrgMembersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export function ToolRoutes() {
  const { t } = useTranslation();
  const fallback = (
    <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-current border-t-transparent rounded-full" />
      {t('toolRoutes.loading')}
    </div>
  );
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={<BacktestPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/monte-carlo" element={<MonteCarloPage />} />
        <Route path="/optimizer" element={<OptimizerPage />} />
        <Route path="/efficient-frontier" element={<EfficientFrontierPage />} />
        <Route path="/data-engine" element={<DataEnginePage />} />
        <Route path="/rebalancing-sensitivity" element={<RebalancingSensitivityPage />} />
        <Route path="/lumpsum-vs-dca" element={<LumpSumVsDCAPage />} />
        <Route path="/factor-regression" element={<FactorRegressionPage />} />
        <Route path="/calculators" element={<CalculatorsPage />} />
        <Route path="/tactical" element={<TacticalPage />} />
        <Route path="/backtest-optimizer" element={<BacktestOptimizerPage />} />
        <Route path="/pca" element={<PCAPage />} />
        <Route path="/signal-analyzer" element={<SignalAnalyzerPage />} />
        <Route path="/dual-signal" element={<DualSignalPage />} />
        <Route path="/multi-signal" element={<MultiSignalPage />} />
        <Route path="/letf-slippage" element={<LETFSlippagePage />} />
        <Route path="/tactical-grid" element={<TacticalGridPage />} />
        <Route path="/goal-optimizer" element={<GoalOptimizerPage />} />
      </Routes>
    </Suspense>
  );
}
