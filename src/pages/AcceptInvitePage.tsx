/**
 * @file 接受邀请页
 * @description 从 URL ?token= 读取邀请令牌。需先登录；登录后点击接受即加入对应组织。
 * @route /accept-invite
 */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, UserPlus, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const cardStyle: React.CSSProperties = { padding: 28, marginTop: 40, textAlign: 'center' };

export default function AcceptInvitePage() {
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
      setError(useAuthStore.getState().error || '接受邀请失败');
      return;
    }
    if (result.orgId) await switchOrg(result.orgId);
    setDone(true);
  };

  if (!token) {
    return (
      <div className="bt-page" style={{ maxWidth: 460, margin: '0 auto' }}>
        <div className="bt-main-card card" style={cardStyle}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>
            邀请链接无效
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>链接缺少邀请令牌。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bt-page" style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="bt-main-card card" style={cardStyle}>
        <InviteHeader />
        {!isAuthed ? (
          <NotAuthedContent token={token} />
        ) : done ? (
          <DoneContent onNavigate={() => navigate('/account')} />
        ) : (
          <InviteFormContent error={error} loading={loading} onAccept={() => void handleAccept()} />
        )}
      </div>
    </div>
  );
}

function InviteHeader() {
  return (
    <>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--brand)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
        }}
      >
        <UserPlus className="w-5 h-5" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
        接受组织邀请
      </h1>
    </>
  );
}

function NotAuthedContent({ token }: { token: string }) {
  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        请先登录或注册账户，然后回到此页面接受邀请。
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
          <LogIn className="w-4 h-4" /> 登录
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
          注册
        </Link>
      </div>
    </>
  );
}

function DoneContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--success, #16a34a)', lineHeight: 1.6 }}>
        已成功加入组织。
      </p>
      <div style={{ marginTop: 18 }}>
        <button
          onClick={onNavigate}
          className="main-action-btn"
          style={{ height: 40, padding: '0 18px' }}
        >
          前往账户中心
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
  return (
    <>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        点击下方按钮接受邀请并加入该组织。
      </p>
      {error && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--danger, #dc2626)',
            padding: '8px 10px',
            background: 'var(--danger-soft, #fef2f2)',
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          {error}
        </div>
      )}
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
          {loading ? '处理中…' : '接受邀请'}
        </button>
      </div>
    </>
  );
}
