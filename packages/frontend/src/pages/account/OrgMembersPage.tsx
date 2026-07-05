import { useState, useEffect } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOrgMembers } from '../hooks/useOrgMembersState.js';
import { MembersTable } from '../components/orgMembers/OrgMembersList.js';
import { InviteSection } from '../components/orgMembers/OrgMembersActions.js';
import { UnauthedMembers } from '../components/orgMembers/utils.js';
import { ROLES } from '../components/orgMembers/types.js';

export default function OrgMembersPage() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const org = useAuthStore((s) => s.org);
  const orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>('analyst');
  const {
    members, invitations, loading, error, busy, load,
    changeRole, removeMember, sendInvite, revokeInvite,
  } = useOrgMembers(isAdmin);

  useEffect(() => {
    if (isAuthed) void load();
  }, [isAuthed, load]);

  if (!isAuthed) return <UnauthedMembers />;

  const handleSubmitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    void sendInvite(inviteEmail, inviteRole).then(() => setInviteEmail(''));
  };

  if (error) {
    return (
      <div className="bt-page" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
          <div style={{ fontSize: 13, color: 'var(--danger, #dc2626)', padding: '8px 10px', background: 'var(--danger-soft, #fef2f2)', borderRadius: 8, marginBottom: 14 }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bt-page" style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="bt-main-card card" style={{ padding: 24, marginTop: 28, textAlign: 'center' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      </div>
    );
  }

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
        <MembersTable
          members={members} isAdmin={isAdmin} busy={busy}
          onChangeRole={changeRole} onRemoveMember={removeMember}
        />
        {isAdmin && (
          <InviteSection
            invitations={invitations} inviteEmail={inviteEmail} inviteRole={inviteRole}
            busy={busy} onInviteEmailChange={setInviteEmail}
            onInviteRoleChange={setInviteRole} onSendInvite={handleSubmitInvite}
            onRevokeInvite={revokeInvite}
          />
        )}
      </div>
    </div>
  );
}
