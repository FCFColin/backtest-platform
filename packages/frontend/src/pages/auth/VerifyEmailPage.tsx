import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, UserPlus, LogIn } from 'lucide-react';
import { apiFetch } from '@/utils/apiClient';
import AuthPageLayout from '@/components/auth/formFields';
import { BrandIconBadge } from '@/components/auth/formFields';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
type Status = 'pending' | 'success' | 'error';
const STATUS_ICONS = {
  pending: <Loader2 className="w-10 h-10 animate-spin text-brand" />,
  success: <CheckCircle2 className="w-10 h-10 text-success" />,
  error: <XCircle className="w-10 h-10 text-danger" />,
};
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');
  const [message, setMessage] = useState(t('Verifying your email...'));
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMessage(t('Missing verification token'));
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
          setMessage(t('Email verified successfully'));
        } else {
          setStatus('error');
          setMessage(body?.detail || t('Verification link is invalid or has expired'));
        }
      } catch {
        setStatus('error');
        setMessage(t('Verification request failed'));
      }
    })();
  }, [token, t]);
  return (
    <AuthPageLayout
      centered
      maxWidth={460}
      icon={<div className="mx-auto mb-3">{STATUS_ICONS[status]}</div>}
      title={t('Email Verification')}
    >
      <p className="text-sm text-fg-tertiary leading-relaxed">{message}</p>
      {status !== 'pending' && (
        <div className="mt-[18px]">
          <Link to="/login" className="main-action-btn inline-flex h-10 items-center px-[18px]">
            {t('Go to Login')}
          </Link>
        </div>
      )}
    </AuthPageLayout>
  );
}
function NotAuthedContent({ token }: { token: string }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-fg-tertiary leading-relaxed">
        {t('Please log in before accepting the invitation')}
      </p>
      <div className="flex gap-2.5 justify-center mt-[18px]">
        <Link
          to="/login"
          state={{ from: `/accept-invite?token=${encodeURIComponent(token)}` }}
          className="main-action-btn inline-flex h-10 items-center gap-1.5 px-4"
        >
          <LogIn className="w-4 h-4" /> {t('Log In')}
        </Link>
        <Link
          to="/signup"
          className="bg-input-bg text-fg border border-border-subtle rounded font-medium inline-flex h-10 items-center px-4 no-underline"
        >
          {t('Sign Up')}
        </Link>
      </div>
    </>
  );
}
function DoneContent({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-success leading-relaxed">
        {t('Successfully joined the organization')}
      </p>
      <div className="mt-[18px]">
        <button onClick={onNavigate} className="main-action-btn h-10 px-[18px]">
          {t('Go to Account')}
        </button>
      </div>
    </>
  );
}
function InviteFormContent({
  error,
  loading,
  onAccept,
}: {
  error: string | null;
  loading: boolean;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-fg-tertiary leading-relaxed">
        {t('Click the button below to accept the invitation')}
      </p>
      <ErrorBanner message={error} style={{ marginTop: 12 }} />
      <div className="mt-[18px]">
        <button
          onClick={onAccept}
          disabled={loading}
          className="main-action-btn h-[42px] px-[22px] inline-flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {loading ? t('Running...') : t('Accept Invitation')}
        </button>
      </div>
    </>
  );
}
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const acceptInvite = useAuthStore((s) => s.acceptInvite);
  const switchOrg = useAuthStore((s) => s.switchOrg);
  const loading = useAuthStore((s) => s.loading);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const handleAccept = async () => {
    setError(null);
    const result = await acceptInvite(token);
    if (!result.ok) {
      setError(useAuthStore.getState().error || t('Failed to accept invitation'));
      return;
    }
    if (result.orgId) await switchOrg(result.orgId);
    setDone(true);
  };
  if (!token) {
    return (
      <AuthPageLayout
        centered
        maxWidth={460}
        title={t('Invitation link is invalid or has expired')}
      >
        <p className="text-sm text-fg-tertiary">{t('Missing invitation token')}</p>
      </AuthPageLayout>
    );
  }
  return (
    <AuthPageLayout
      centered
      maxWidth={460}
      icon={
        <BrandIconBadge
          icon={<UserPlus className="w-5 h-5" />}
          size="lg"
          style={{ margin: '0 auto 14px' }}
        />
      }
      title={t('Accept Invitation')}
    >
      {!isAuthed ? (
        <NotAuthedContent token={token} />
      ) : done ? (
        <DoneContent onNavigate={() => navigate('/account')} />
      ) : (
        <InviteFormContent error={error} loading={loading} onAccept={() => void handleAccept()} />
      )}
    </AuthPageLayout>
  );
}
