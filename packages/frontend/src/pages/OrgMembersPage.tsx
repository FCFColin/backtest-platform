/**
 * @file 组织成员管理页
 * @description 组织管理员可在此查看/调整成员角色、移除成员，并创建/撤销邮箱邀请。
 *              数据来源 /api/v1/orgs/*，写操作要求 owner/admin。
 * @route /org/members
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Loader2, Trash2, Mail, Send } from 'lucide-react';
import { apiFetch } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';

interface Member {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
}

const ROLES = ['admin', 'analyst', 'readonly'] as const;

const TABLE_TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  padding: '8px 10px',
};
const TABLE_TD: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-body)',
  padding: '8px 10px',
  borderTop: '1px solid var(--border, #e5e7eb)',
};

/** 成员表格 */
interface MembersTableProps {
  members: Member[];
  isAdmin: boolean;
  busy: boolean;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
}

function MembersTable({ members, isAdmin, busy, onChangeRole, onRemoveMember }: MembersTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
      <thead>
        <tr>
          <th style={TABLE_TH}>用户</th>
          <th style={TABLE_TH}>邮箱</th>
          <th style={TABLE_TH}>角色</th>
          {isAdmin && <th style={TABLE_TH}>操作</th>}
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.userId}>
            <td style={TABLE_TD}>{m.username}</td>
            <td style={TABLE_TD}>{m.email ?? '—'}</td>
            <td style={TABLE_TD}>
              {isAdmin && m.role !== 'owner' ? (
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => void onChangeRole(m.userId, e.target.value)}
                  className="portfolio-rebalance-select"
                  style={{ height: 32 }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ textTransform: 'capitalize' }}>{m.role}</span>
              )}
            </td>
            {isAdmin && (
              <td style={TABLE_TD}>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => void onRemoveMember(m.userId)}
                    disabled={busy}
                    title="移除成员"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--danger, #dc2626)',
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 邀请区 */
interface InviteSectionProps {
  invitations: Invitation[];
  inviteEmail: string;
  inviteRole: (typeof ROLES)[number];
  busy: boolean;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: (typeof ROLES)[number]) => void;
  onSendInvite: (e: React.FormEvent) => void;
  onRevokeInvite: (id: string) => void;
}

function InviteSection({
  invitations,
  inviteEmail,
  inviteRole,
  busy,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInvite,
  onRevokeInvite,
}: InviteSectionProps) {
  return (
    <div>
      <h2
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-strong)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Mail className="w-4 h-4" /> 邀请成员
      </h2>
      <InviteForm
        inviteEmail={inviteEmail}
        inviteRole={inviteRole}
        busy={busy}
        onInviteEmailChange={onInviteEmailChange}
        onInviteRoleChange={onInviteRoleChange}
        onSendInvite={onSendInvite}
      />
      {invitations.length > 0 && (
        <InvitationTable invitations={invitations} busy={busy} onRevokeInvite={onRevokeInvite} />
      )}
    </div>
  );
}

function InviteForm({
  inviteEmail,
  inviteRole,
  busy,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInvite,
}: {
  inviteEmail: string;
  inviteRole: (typeof ROLES)[number];
  busy: boolean;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: (typeof ROLES)[number]) => void;
  onSendInvite: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={(e) => void onSendInvite(e)}
      style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}
    >
      <input
        type="email"
        required
        placeholder="邀请邮箱"
        value={inviteEmail}
        onChange={(e) => onInviteEmailChange(e.target.value)}
        className="portfolio-rebalance-select"
        style={{ height: 38, flex: '1 1 220px' }}
      />
      <select
        value={inviteRole}
        onChange={(e) => onInviteRoleChange(e.target.value as (typeof ROLES)[number])}
        className="portfolio-rebalance-select"
        style={{ height: 38 }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy}
        className="main-action-btn"
        style={{
          height: 38,
          padding: '0 16px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Send className="w-4 h-4" /> 发送邀请
      </button>
    </form>
  );
}

function InvitationTable({
  invitations,
  busy,
  onRevokeInvite,
}: {
  invitations: Invitation[];
  busy: boolean;
  onRevokeInvite: (id: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={TABLE_TH}>邮箱</th>
          <th style={TABLE_TH}>角色</th>
          <th style={TABLE_TH}>状态</th>
          <th style={TABLE_TH}>操作</th>
        </tr>
      </thead>
      <tbody>
        {invitations.map((inv) => (
          <tr key={inv.id}>
            <td style={TABLE_TD}>{inv.email}</td>
            <td style={TABLE_TD}>{inv.role}</td>
            <td style={TABLE_TD}>{inv.acceptedAt ? '已接受' : '待接受'}</td>
            <td style={TABLE_TD}>
              {!inv.acceptedAt && (
                <button
                  onClick={() => void onRevokeInvite(inv.id)}
                  disabled={busy}
                  title="撤销邀请"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--danger, #dc2626)',
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 成员内容区域 */
interface MembersContentProps {
  members: Member[];
  invitations: Invitation[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  busy: boolean;
  inviteEmail: string;
  inviteRole: (typeof ROLES)[number];
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: (typeof ROLES)[number]) => void;
  onSendInvite: (e: React.FormEvent) => void;
  onRevokeInvite: (id: string) => void;
}

function MembersContent({
  members,
  invitations,
  loading,
  error,
  isAdmin,
  busy,
  inviteEmail,
  inviteRole,
  onChangeRole,
  onRemoveMember,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInvite,
  onRevokeInvite,
}: MembersContentProps) {
  if (error) {
    return (
      <div
        style={{
          fontSize: 13,
          color: 'var(--danger, #dc2626)',
          padding: '8px 10px',
          background: 'var(--danger-soft, #fef2f2)',
          borderRadius: 8,
          marginBottom: 14,
        }}
      >
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <>
      <MembersTable
        members={members}
        isAdmin={isAdmin}
        busy={busy}
        onChangeRole={onChangeRole}
        onRemoveMember={onRemoveMember}
      />
      {isAdmin && (
        <InviteSection
          invitations={invitations}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          busy={busy}
          onInviteEmailChange={onInviteEmailChange}
          onInviteRoleChange={onInviteRoleChange}
          onSendInvite={onSendInvite}
          onRevokeInvite={onRevokeInvite}
        />
      )}
    </>
  );
}

/** 组织成员管理 hook，封装所有 API 操作 */
function useOrgMembers(isAdmin: boolean) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes] = await Promise.all([
        apiFetch('/api/v1/orgs/members'),
        isAdmin ? apiFetch('/api/v1/orgs/invitations') : Promise.resolve(null),
      ]);
      if (mRes.ok) setMembers((await mRes.json())?.data ?? []);
      if (iRes && iRes.ok) setInvitations((await iRes.json())?.data ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const changeRole = async (userId: string, role: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) setError((await res.json())?.detail || '更新角色失败');
      else await load();
    });
  };

  const removeMember = async (userId: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || '移除成员失败');
      else await load();
    });
  };

  const sendInvite = async (email: string, role: string) => {
    await withBusy(async () => {
      setError(null);
      const res = await apiFetch('/api/v1/orgs/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) setError((await res.json())?.detail || '发送邀请失败');
      else await load();
    });
  };

  const revokeInvite = async (id: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/invitations/${id}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || '撤销邀请失败');
      else await load();
    });
  };

  return {
    members,
    invitations,
    loading,
    error,
    busy,
    load,
    changeRole,
    removeMember,
    sendInvite,
    revokeInvite,
  };
}

/** 未登录提示 */
function UnauthedMembers() {
  return (
    <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <p style={{ color: 'var(--text-muted)' }}>
          请先{' '}
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            登录
          </Link>{' '}
          后管理组织成员。
        </p>
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function OrgMembersPage() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const org = useAuthStore((s) => s.org);
  const orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('analyst');
  const {
    members,
    invitations,
    loading,
    error,
    busy,
    load,
    changeRole,
    removeMember,
    sendInvite,
    revokeInvite,
  } = useOrgMembers(isAdmin);

  useEffect(() => {
    if (isAuthed) void load();
  }, [isAuthed, load]);

  if (!isAuthed) return <UnauthedMembers />;

  const handleSubmitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    void sendInvite(inviteEmail, inviteRole).then(() => setInviteEmail(''));
  };

  return (
    <div className="bt-page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Users className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            成员管理
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {org ? `组织：${org.name}` : '当前组织'}
        </p>
        <MembersContent
          members={members}
          invitations={invitations}
          loading={loading}
          error={error}
          isAdmin={isAdmin}
          busy={busy}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          onChangeRole={changeRole}
          onRemoveMember={removeMember}
          onInviteEmailChange={setInviteEmail}
          onInviteRoleChange={setInviteRole}
          onSendInvite={handleSubmitInvite}
          onRevokeInvite={revokeInvite}
        />
      </div>
    </div>
  );
}
