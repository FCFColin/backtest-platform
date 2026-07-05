import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import Toast from '@/components/Toast';
import { DegradedBanner } from '@/components/DegradedBanner';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuthStore } from '@/store/authStore';

const BacktestPage = lazy(() => import('@/pages/backtest/BacktestPage'));
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage'));
const MonteCarloPage = lazy(() => import('@/pages/backtest/MonteCarloPage'));
const OptimizerPage = lazy(() => import('@/pages/OptimizerPage'));
const EfficientFrontierPage = lazy(() => import('@/pages/analysis/EfficientFrontierPage'));
const DataEnginePage = lazy(() => import('@/pages/DataEnginePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const RebalancingSensitivityPage = lazy(() => import('@/pages/backtest/RebalancingSensitivityPage'));
const LumpSumVsDCAPage = lazy(() => import('@/pages/LumpSumVsDCAPage'));
const FactorRegressionPage = lazy(() => import('@/pages/analysis/FactorRegressionPage'));
const CalculatorsPage = lazy(() => import('@/pages/CalculatorsPage'));
const TacticalPage = lazy(() => import('@/pages/TacticalPage'));
const BacktestOptimizerPage = lazy(() => import('@/pages/backtest/BacktestOptimizerPage'));
const PCAPage = lazy(() => import('@/pages/analysis/PCAPage'));
const SignalAnalyzerPage = lazy(() => import('@/pages/SignalAnalyzerPage'));
const DualSignalPage = lazy(() => import('@/pages/DualSignalPage'));
const MultiSignalPage = lazy(() => import('@/pages/MultiSignalPage'));
const LETFSlippagePage = lazy(() => import('@/pages/LETFSlippagePage'));
const TacticalGridPage = lazy(() => import('@/pages/TacticalGridPage'));
const GoalOptimizerPage = lazy(() => import('@/pages/GoalOptimizerPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('@/pages/AcceptInvitePage'));
const OrgMembersPage = lazy(() => import('@/pages/account/OrgMembersPage'));
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
      <DegradedBanner />
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
