import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import Toast from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { ToolRoutes } from '@/routes/ToolRoutes';
import { PublicRoutes } from '@/routes/PublicRoutes';
import { AuthRoutes } from '@/routes/AuthRoutes';
import { AccountRoutes } from '@/routes/AccountRoutes';
import { AdminRoutes } from '@/routes/AdminRoutes';

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  return (
    <>
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
