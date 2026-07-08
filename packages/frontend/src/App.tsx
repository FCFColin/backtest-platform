import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import Toast from '@/components/Toast';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

const BacktestPage = lazy(() => import('@/pages/backtest/BacktestPage'));
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage'));
const MonteCarloPage = lazy(() => import('@/pages/monte-carlo/MonteCarloPage'));
const OptimizerPage = lazy(() => import('@/pages/optimizer/OptimizerPage'));
const EfficientFrontierPage = lazy(
  () => import('@/pages/efficient-frontier/EfficientFrontierPage'),
);
const DataEnginePage = lazy(() => import('@/pages/data-engine/DataEnginePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
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
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const PricingPage = lazy(() => import('@/pages/account/PricingPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage'));
const OrgMembersPage = lazy(() => import('@/pages/OrgMembersPage'));
const BillingPage = lazy(() => import('@/pages/account/BillingPage'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const SystemMonitor = lazy(() => import('@/pages/admin/SystemMonitor'));
const DataManagement = lazy(() => import('@/pages/admin/DataManagement'));
const SystemSettings = lazy(() => import('@/pages/admin/SystemSettings'));

/** 应用路由表 */
function AppRoutes() {
  return (
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
      <Route path="/help" element={<HelpPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
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
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/limits" element={<AboutPage section="limits" />} />
      <Route path="/upgrade" element={<AboutPage section="upgrade" />} />
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
  );
}

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const initAuth = useAuthStore((s) => s.init);

  // 应用启动时尝试用 localStorage 中的 Refresh Token 静默恢复会话（ADR-034）。
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  return (
    <>
      {!isAdmin && <Navbar />}
      <Toast />
      <Suspense
        fallback={
          <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {/* loading */}
          </div>
        }
      >
        <AppRoutes />
      </Suspense>
      {!isAdmin && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
    </Router>
  );
}
