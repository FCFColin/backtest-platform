/**
 * @file 邮箱验证页
 * @description 从 URL ?token= 读取验证令牌，自动调用后端验证邮箱并展示结果。
 * @route /verify-email
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

type Status = 'pending' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');
  const [message, setMessage] = useState('正在验证你的邮箱…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMessage('验证链接缺少令牌。');
      return;
    }
    void (async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();
        if (res.ok && body?.data?.verified) {
          setStatus('success');
          setMessage('邮箱验证成功，你现在可以登录使用全部功能。');
        } else {
          setStatus('error');
          setMessage(body?.detail || '验证链接无效或已过期。');
        }
      } catch {
        setStatus('error');
        setMessage('验证请求失败，请稍后重试。');
      }
    })();
  }, [token]);

  const icon =
    status === 'pending' ? (
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--brand)' }} />
    ) : status === 'success' ? (
      <CheckCircle2 className="w-10 h-10" style={{ color: 'var(--success, #16a34a)' }} />
    ) : (
      <XCircle className="w-10 h-10" style={{ color: 'var(--danger, #dc2626)' }} />
    );

  return (
    <div className="bt-page" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <div style={{ margin: '0 auto 12px' }}>{icon}</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
          邮箱验证
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{message}</p>
        {status !== 'pending' && (
          <div style={{ marginTop: 18 }}>
            <Link
              to="/login"
              className="main-action-btn"
              style={{
                display: 'inline-flex',
                height: 40,
                alignItems: 'center',
                padding: '0 18px',
              }}
            >
              前往登录
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
