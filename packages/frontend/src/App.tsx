import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PromoBar } from '@/components/layout/PromoBar.js';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { ToolRoutes } from '@/routes';
import { PublicRoutes } from '@/routes/PublicRoutes';
import { AuthRoutes } from '@/routes/AuthRoutes';
import { AccountRoutes } from '@/routes/AccountRoutes';
import { AdminRoutes } from '@/routes/AdminRoutes';

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const initAuth = useAuthStore((s) => s.init);
  const isAuthenticated = useAuthStore((s) => s.user !== null);
  const idleTimeoutMs = useAuthStore((s) => s.idleTimeoutMs);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // P0-04：空闲会话超时（等保三级身份鉴别刚需）
  useIdleTimeout(idleTimeoutMs, isAuthenticated);

  return (
    <>
      {!isAdmin && (
        <PromoBar
          id="synthetic-tickers-2026"
          message="合成标的支持回测至 1962 年"
          ctaLabel="立即体验"
          ctaLink="/backtest"
          variant="info"
        />
      )}
      {!isAdmin && <Navbar />}
      <Toast />
      <main style={{ paddingTop: isAdmin ? 0 : 80, minHeight: '100vh' }}>
        <ToolRoutes />
        <PublicRoutes />
        <AuthRoutes />
        <AccountRoutes />
        <AdminRoutes />
      </main>
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
