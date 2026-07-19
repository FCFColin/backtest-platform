/**
 * 需认证页面路由组 — 账户/组织/计费等需要登录的页面。
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';

const AccountPage = lazy(() => import('@/pages/account/AccountPage'));
const OrgMembersPage = lazy(() => import('@/pages/OrgMembersPage'));
const BillingPage = lazy(() => import('@/pages/account/BillingPage'));

const fallback = (
  <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
    {/* loading */}
  </div>
);

export function AccountRoutes() {
  return (
    <Suspense fallback={fallback}>
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
