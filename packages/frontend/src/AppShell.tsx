import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { OfflineBanner } from '@/components/stateDisplay';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PromoBar } from '@/components/layout/Navbar';
import { Toast } from '@/components/stateDisplay';
import { useAuthStore } from '@/store/authStore';
import { useIdleTimeout } from '@/hooks/miscHooks';
import { AppRoutes } from '@/routes';
import {
  reportPageLoadTiming,
  onNavStart,
  initVitalsReporting,
} from './utils/performanceReporter.js';
export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAdmin = location.pathname.startsWith('/admin');
  const initAuth = useAuthStore((s) => s.init);
  const isAuthenticated = useAuthStore((s) => s.user !== null);
  const idleTimeoutMs = useAuthStore((s) => s.idleTimeoutMs);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);
  useEffect(() => {
    const onSessionExpired = () => {
      if (!useAuthStore.getState().user) return;
      void useAuthStore.getState().logout();
      navigate('/login', { replace: true });
    };
    window.addEventListener('session-expired', onSessionExpired);
    return () => window.removeEventListener('session-expired', onSessionExpired);
  }, [navigate]);
  useEffect(() => {
    onNavStart();
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    initVitalsReporting();
    const timer = setTimeout(() => {
      reportPageLoadTiming();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);
  useIdleTimeout(idleTimeoutMs, isAuthenticated);
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <OfflineBanner />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand focus:text-brand-fg focus:rounded focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {t('Skip to main content')}
      </a>
      {!isAdmin && (
        <PromoBar
          id="synthetic-tickers-2026"
          message={t('Synthetic tickers support backtesting back to 1962')}
          ctaLabel={t('Try now')}
          ctaLink="/"
          variant="info"
        />
      )}
      {!isAdmin && <Navbar />}
      <Toast />
      <main id="main-content" tabIndex={-1} style={{ flex: '1 0 auto', outline: 'none' }}>
        <AppRoutes />
      </main>
      {!isAdmin && <Footer />}
    </TooltipPrimitive.Provider>
  );
}
