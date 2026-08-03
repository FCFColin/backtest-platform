import { memo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
// 布局静态区块 memo：路由切换时 AppShell 重渲染，这些组件无 location 依赖，
const MemoOfflineBanner = memo(OfflineBanner);
const MemoPromoBar = memo(PromoBar);
const MemoToast = memo(Toast);
const MemoFooter = memo(Footer);
export default function AppShell() {
  const location = useLocation();
  const { t } = useTranslation();
  const isAdmin = location.pathname.startsWith('/admin');
  const initAuth = useAuthStore((s) => s.init);
  const isAuthenticated = useAuthStore((s) => s.user !== null);
  const idleTimeoutMs = useAuthStore((s) => s.idleTimeoutMs);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);
  useEffect(() => {
    onNavStart();
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
    <>
      <MemoOfflineBanner />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand focus:text-brand-fg focus:rounded focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {t('a11y.skipToMain')}
      </a>
      {!isAdmin && (
        <MemoPromoBar
          id="synthetic-tickers-2026"
          message={t('promo.synthetic.message')}
          ctaLabel={t('promo.synthetic.ctaLabel')}
          ctaLink="/"
          variant="info"
        />
      )}
      {!isAdmin && <Navbar />}
      <MemoToast />
      <main
        id="main-content"
        tabIndex={-1}
        style={{ paddingTop: isAdmin ? 0 : 80, flex: '1 0 auto', outline: 'none' }}
      >
        <AppRoutes />
      </main>
      {!isAdmin && <MemoFooter />}
    </>
  );
}
