import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PromoBar } from '@/components/layout/PromoBar.js';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { AppRoutes } from '@/routes';

function AppLayout() {
  const location = useLocation();
  const { t } = useTranslation();
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
      {/* D10-014: skip-to-main-content 链接，键盘用户跳过 PromoBar/Navbar 直达主内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand focus:text-brand-fg focus:rounded focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {t('a11y.skipToMain')}
      </a>
      {!isAdmin && (
        <PromoBar
          id="synthetic-tickers-2026"
          message={t('promo.synthetic.message')}
          ctaLabel={t('promo.synthetic.ctaLabel')}
          ctaLink="/"
          variant="info"
        />
      )}
      {!isAdmin && <Navbar />}
      <Toast />
      <main
        id="main-content"
        tabIndex={-1}
        style={{ paddingTop: isAdmin ? 0 : 80, flex: '1 0 auto', outline: 'none' }}
      >
        <AppRoutes />
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