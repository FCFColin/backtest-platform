/**
 * @file 接受邀请页
 * @description 从 URL ?token= 读取邀请令牌。需先登录；登录后点击接受即加入对应组织。
 * @route /accept-invite
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, UserPlus, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import AuthPageLayout from '@/components/auth/AuthPageLayout';
import BrandIconBadge from '@/components/auth/BrandIconBadge';

export default function AcceptInvitePage() {
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
      setError(useAuthStore.getState().error || t('auth.acceptInvite.acceptFailed'));
      return;
    }
    if (result.orgId) await switchOrg(result.orgId);
    setDone(true);
  };

  if (!token) {
    return (
      <AuthPageLayout centered maxWidth={460} title={t('auth.acceptInvite.invalidLink')}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {t('auth.acceptInvite.missingToken')}
        </p>
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
      title={t('auth.acceptInvite.title')}
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

function NotAuthedContent({ token }: { token: string }) {
  const { t } = useTranslation();
  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('auth.acceptInvite.loginFirstHint')}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
        <Link
          to="/login"
          state={{ from: `/accept-invite?token=${encodeURIComponent(token)}` }}
          className="main-action-btn"
          style={{
            display: 'inline-flex',
            height: 40,
            alignItems: 'center',
            gap: 6,
            padding: '0 16px',
          }}
        >
          <LogIn className="w-4 h-4" /> {t('auth.login.submit')}
        </Link>
        <Link
          to="/signup"
          className="portfolio-rebalance-select"
          style={{
            display: 'inline-flex',
            height: 40,
            alignItems: 'center',
            padding: '0 16px',
            textDecoration: 'none',
          }}
        >
          {t('auth.signup.submit')}
        </Link>
      </div>
    </>
  );
}

function DoneContent({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--success, #16a34a)', lineHeight: 1.6 }}>
        {t('auth.acceptInvite.joinSuccess')}
      </p>
      <div style={{ marginTop: 18 }}>
        <button
          onClick={onNavigate}
          className="main-action-btn"
          style={{ height: 40, padding: '0 18px' }}
        >
          {t('auth.acceptInvite.goToAccount')}
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
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('auth.acceptInvite.clickToAccept')}
      </p>
      <ErrorBanner message={error} style={{ marginTop: 12 }} />
      <div style={{ marginTop: 18 }}>
        <button
          onClick={onAccept}
          disabled={loading}
          className="main-action-btn"
          style={{
            height: 42,
            padding: '0 22px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {loading ? t('common.running') : t('auth.acceptInvite.acceptButton')}
        </button>
      </div>
    </>
  );
}
