/**
 * 管理后台路由组 — 仪表盘/监控/数据管理/系统设置。
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';

const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const SystemMonitor = lazy(() => import('@/pages/admin/SystemMonitor'));
const DataManagement = lazy(() => import('@/pages/admin/DataManagement'));
const SystemSettings = lazy(() => import('@/pages/admin/SystemSettings'));

const fallback = (
  <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
    {/* loading */}
  </div>
);

export function AdminRoutes() {
  return (
    <Suspense fallback={fallback}>
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
