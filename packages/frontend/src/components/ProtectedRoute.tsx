import { Navigate, useLocation } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { LoadingState } from '@/components/stateDisplay';
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}
export default function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const { user, initialized } = useAuthStore(
    useShallow((s) => ({ user: s.user, initialized: s.initialized })),
  );
  const location = useLocation();
  if (!initialized) return <LoadingState />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (requireAdmin && !user.platformAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
