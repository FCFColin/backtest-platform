/**
 * 公开页面路由组 — 关于/联系/帮助/定价等无需认证的静态页面。
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const PricingPage = lazy(() => import('@/pages/account/PricingPage'));

const fallback = (
  <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
    {/* loading */}
  </div>
);

export function PublicRoutes() {
  return (
    <Suspense fallback={fallback}>
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
