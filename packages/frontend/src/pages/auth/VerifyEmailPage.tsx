/**
 * @file 邮箱验证页
 * @description 从 URL ?token= 读取验证令牌，自动调用后端验证邮箱并展示结果。
 * @route /verify-email
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '@/utils/apiClient';
import AuthPageLayout from '@/components/auth/AuthPageLayout';

type Status = 'pending' | 'success' | 'error';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');
  const [message, setMessage] = useState(t('auth.verifyEmail.pending'));
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMessage(t('auth.verifyEmail.missingToken'));
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();
        if (res.ok && body?.data?.verified) {
          setStatus('success');
          setMessage(t('auth.verifyEmail.success'));
        } else {
          setStatus('error');
          setMessage(body?.detail || t('auth.verifyEmail.invalidLink'));
        }
      } catch {
        setStatus('error');
        setMessage(t('auth.verifyEmail.requestFailed'));
      }
    })();
  }, [token, t]);

  const statusIcon =
    status === 'pending' ? (
      <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--brand)' }} />
    ) : status === 'success' ? (
      <CheckCircle2 className="w-10 h-10" style={{ color: 'var(--success, #16a34a)' }} />
    ) : (
      <XCircle className="w-10 h-10" style={{ color: 'var(--danger, #dc2626)' }} />
    );

  return (
    <AuthPageLayout
      centered
      maxWidth={460}
      icon={<div style={{ margin: '0 auto 12px' }}>{statusIcon}</div>}
      title={t('auth.verifyEmail.title')}
    >
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
            {t('auth.verifyEmail.goToLogin')}
          </Link>
        </div>
      )}
    </AuthPageLayout>
  );
}
