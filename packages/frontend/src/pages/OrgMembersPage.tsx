/**
 * @file 组织成员管理页
 * @description 组织管理员可在此查看/调整成员角色、移除成员，并创建/撤销邮箱邀请。
 *              数据来源 /api/v1/orgs/*，写操作要求 owner/admin。
 *
 *              本文件仅为容器：组合 useOrgMembersState（状态/API）、MemberTable
 *              （成员列表）、InviteDialog（邀请表单 + 邀请列表）。具体实现见
 *              ./org/ 目录下各模块。
 * @route /org/members
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Users, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ErrorBanner from '@/components/ErrorBanner';
import { MemberTable } from './org/MemberTable.js';
import { InviteDialog } from './org/InviteDialog.js';
import { useOrgMembersState } from './org/hooks/useOrgMembersState.js';
import type { Member, Invitation, Role } from './org/orgTypes.js';

/** 成员内容区域 props */
interface MembersContentProps {
  members: Member[];
  invitations: Invitation[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  busy: boolean;
  inviteEmail: string;
  inviteRole: Role;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: Role) => void;
  onSendInvite: (e: FormEvent) => void;
  onRevokeInvite: (id: string) => void;
}

/** 成员内容区域：错误/加载态，或成员表 + 邀请区 */
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
    return <ErrorBanner message={error} style={{ marginBottom: 14 }} />;
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
      <MemberTable
        members={members}
        isAdmin={isAdmin}
        busy={busy}
        onChangeRole={onChangeRole}
        onRemoveMember={onRemoveMember}
      />
      {isAdmin && (
        <InviteDialog
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

/** 未登录提示 */
function UnauthedMembers() {
  const { t } = useTranslation();
  return (
    <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div
        className="bt-main-card card"
        style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
      >
        <p style={{ color: 'var(--text-muted)' }}>
          {t('orgMembers.unauthed.prefix')}{' '}
          <Link to="/login" style={{ color: 'var(--brand)' }}>
            {t('orgMembers.unauthed.login')}
          </Link>{' '}
          {t('orgMembers.unauthed.suffix')}
        </p>
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function OrgMembersPage() {
  const { t } = useTranslation();
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const org = useAuthStore((s) => s.org);
  const orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('analyst');
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
  } = useOrgMembersState(isAdmin);

  useEffect(() => {
    if (isAuthed) void load();
  }, [isAuthed, load]);

  if (!isAuthed) return <UnauthedMembers />;

  const handleSubmitInvite = (e: FormEvent) => {
    e.preventDefault();
    void sendInvite(inviteEmail, inviteRole).then(() => setInviteEmail(''));
  };

  return (
    <div className="bt-page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Users className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            {t('orgMembers.title')}
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {org ? `${t('orgMembers.orgLabel')}${org.name}` : t('orgMembers.orgLabel')}
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
