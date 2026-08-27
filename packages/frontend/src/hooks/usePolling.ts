import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
type F = () => void | Promise<void>;
export function useOrgAuth() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const org = useAuthStore((s) => s.org);
  const orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  return { isAuthed, org, orgRole, isAdmin: orgRole === 'owner' || orgRole === 'admin' };
}
export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const w = window.matchMedia(q);
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    w.addEventListener('change', h);
    return () => w.removeEventListener('change', h);
  }, [q]);
  return m;
}
export function useChartAnimation(large: boolean) {
  const r = useMediaQuery('(prefers-reduced-motion: reduce)');
  return { isAnimationActive: !large && !r };
}
export function useTheme() {
  const pref = useSettingsStore((s) => s.theme);
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const t = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
  useEffect(() => void (document.documentElement.dataset.theme = t), [t]);
  return { theme: pref, resolvedTheme: t, isDark: t === 'dark', setTheme: useSettingsStore((s) => s.setTheme), toggleTheme: useSettingsStore((s) => s.toggleTheme) };
}
export function usePolling(fn: F, ms: number, { enabled = true, deps = [], immediate = true }: { enabled?: boolean; deps?: unknown[]; immediate?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) return;
    if (immediate) fn();
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [enabled, ms, immediate, ...deps]);
}
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const lastActivity = useRef(Date.now());
  const triggered = useRef(false);
  const resetActivity = useCallback(() => (lastActivity.current = Date.now()), []);
  const triggerTimeout = useCallback(async () => {
    if (triggered.current) return;
    triggered.current = true;
    await logout();
    navigate('/login?reason=session_expired', { replace: true });
  }, [logout, navigate]);
  const checkTimeout = useCallback(() => {
    if (enabled && timeoutMs > 0 && Date.now() - lastActivity.current >= timeoutMs) void triggerTimeout();
  }, [enabled, timeoutMs, triggerTimeout]);
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;
    triggered.current = false;
    lastActivity.current = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    const onVis = () => document.visibilityState === 'visible' && checkTimeout();
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(checkTimeout, 60_000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [enabled, timeoutMs, resetActivity, checkTimeout]);
}
