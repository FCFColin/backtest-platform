/**
 * 空闲会话超时 hook（P0-04，等保三级 8.1.4 身份鉴别刚需）
 *
 * 监听用户交互事件（mousemove / keydown / mousedown / touchstart / scroll），
 * 在指定超时时间无活动后自动登出并跳转登录页。标签页切换时（visibilitychange）
 * 继续计时，确保用户离开工位后会话自动终止。
 *
 * 等保三级要求：会话空闲超时是"登录失败处理"和"会话安全"的核心控制点。
 * 超时后必须清除本地凭证并强制重新认证，防止未锁屏的浏览器标签页被他人利用。
 */
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/** 触发超时计时的用户活动事件列表 */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'keydown',
  'mousedown',
  'touchstart',
  'scroll',
];

/** 心跳间隔：定期检查是否超时（避免高频事件触发计时器重置的开销） */
const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * 空闲会话超时 hook。
 *
 * @param timeoutMs - 超时时间（毫秒），0 或负数表示禁用
 * @param enabled - 是否启用（仅认证后生效）
 */
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef<boolean>(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const triggerTimeout = useCallback(async () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    // 清除令牌 + 吊销服务端刷新令牌
    await logout();

    // 跳转登录页并携带 reason 参数，供登录页展示友好提示
    navigate('/login?reason=session_expired', { replace: true });
  }, [logout, navigate]);

  const checkTimeout = useCallback(() => {
    if (!enabled || timeoutMs <= 0) return;
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= timeoutMs) {
      void triggerTimeout();
    }
  }, [enabled, timeoutMs, triggerTimeout]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      // 未启用时清理
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 重置状态
    triggeredRef.current = false;
    lastActivityRef.current = Date.now();

    // 监听用户活动事件（passive: true 避免阻塞主线程）
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetActivity, { passive: true });
    });

    // visibilitychange：标签页切回前台时立即检查是否已超时
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkTimeout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 定期检查超时
    timerRef.current = setInterval(checkTimeout, HEARTBEAT_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, timeoutMs, resetActivity, checkTimeout]);
}
