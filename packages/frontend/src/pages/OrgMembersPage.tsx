import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Users, Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { StandardPageShell } from '../components/shells/index.js';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
import { useOrgMembersState } from './org/hooks/useOrgMembersState.js';
import { ROLES, type Invitation, type Member, type Role } from './org/orgTypes.js';
const TH = 'text-left text-xs font-semibold text-[var(--text-muted)] px-[10px] py-2';
const TD = 'text-[13px] text-[var(--text-body)] py-2 px-[10px]';
function UnauthedMembers() {
  const { t } = useTranslation();
  return (
    <div className="bt-page max-w-[720px]">
      <div className="bt-main-card card p-7 mt-10 text-center">
        <p className="text-[var(--text-muted)]">
          {t('Please')}{' '}
          <Link to="/login" className="text-brand">
            {t('log in')}
          </Link>{' '}
          {t('to manage organization members.')}
        </p>
      </div>
    </div>
  );
}
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
    <StandardPageShell
      config={{
        titleKey: 'orgMembers.title',
        headerExtra: <Users className="w-5 h-5 text-brand" />,
      }}
    >
      <div className="bt-main-card card p-6 mt-7">
        <p className="text-[13px] text-[var(--text-muted)] mb-4">
          {org ? `${t('Organization:')}${org.name}` : t('Organization:')}
        </p>
        {error ? (
          <ErrorBanner message={error} style={{ marginBottom: 14 }} />
        ) : loading ? (
          <div className="p-[30px] text-center text-[var(--text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <MemberTable
              members={members}
              isAdmin={isAdmin}
              busy={busy}
              onChangeRole={changeRole}
              onRemoveMember={removeMember}
            />
            {isAdmin && (
              <InviteDialog
                invitations={invitations}
                inviteEmail={inviteEmail}
                inviteRole={inviteRole}
                busy={busy}
                onInviteEmailChange={setInviteEmail}
                onInviteRoleChange={setInviteRole}
                onSendInvite={handleSubmitInvite}
                onRevokeInvite={revokeInvite}
              />
            )}
          </>
        )}
      </div>
    </StandardPageShell>
  );
}
interface RoleSelectProps {
  value: string;
  disabled?: boolean;
  onChange: (role: Role) => void;
  className?: string;
}
function RoleSelect({ value, disabled, onChange, className }: RoleSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className={className}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
interface MemberTableProps {
  members: Member[];
  isAdmin: boolean;
  busy: boolean;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
}
function MemberTable({ members, isAdmin, busy, onChangeRole, onRemoveMember }: MemberTableProps) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse mb-6">
        <thead>
          <tr>
            <th className={TH}>{t('User')}</th>
            <th className={TH}>{t('Email')}</th>
            <th className={TH}>{t('Role')}</th>
            {isAdmin && <th className={TH}>{t('Action')}</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td className={TD}>{m.username}</td>
              <td className={TD}>{m.email ?? '-'}</td>
              <td className={TD}>
                {isAdmin && m.role !== 'owner' ? (
                  <RoleSelect
                    value={m.role}
                    disabled={busy}
                    onChange={(r) => void onChangeRole(m.userId, r)}
                    className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[32px]"
                  />
                ) : (
                  <span className="capitalize">{m.role}</span>
                )}
              </td>
              {isAdmin && (
                <td className={TD}>
                  {m.role !== 'owner' && (
                    <button
                      onClick={() => void onRemoveMember(m.userId)}
                      disabled={busy}
                      title={t('Remove Member')}
                      className="bg-transparent border-0 cursor-pointer text-danger"
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
    </div>
  );
}
interface InviteDialogProps {
  invitations: Invitation[];
  inviteEmail: string;
  inviteRole: Role;
  busy: boolean;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: Role) => void;
  onSendInvite: (e: FormEvent) => void;
  onRevokeInvite: (id: string) => void;
}
function InviteDialog({
  invitations,
  inviteEmail,
  inviteRole,
  busy,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInvite,
  onRevokeInvite,
}: InviteDialogProps) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-[15px] font-bold text-[var(--text-strong)] flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4" /> {t('Invite Member')}
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
interface InviteFormProps {
  inviteEmail: string;
  inviteRole: Role;
  busy: boolean;
  onInviteEmailChange: (v: string) => void;
  onInviteRoleChange: (r: Role) => void;
  onSendInvite: (e: FormEvent) => void;
}
function InviteForm({
  inviteEmail,
  inviteRole,
  busy,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInvite,
}: InviteFormProps) {
  const { t } = useTranslation();
  return (
    <form onSubmit={(e) => void onSendInvite(e)} className="flex gap-2 mb-4 flex-wrap">
      <input
        type="email"
        required
        placeholder={t('Invite email')}
        value={inviteEmail}
        onChange={(e) => onInviteEmailChange(e.target.value)}
        className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[38px] flex-[1_1_220px]"
      />
      <RoleSelect
        value={inviteRole}
        onChange={onInviteRoleChange}
        className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[38px]"
      />
      <button
        type="submit"
        disabled={busy}
        className="main-action-btn h-[38px] px-4 inline-flex items-center gap-1.5"
      >
        <Send className="w-4 h-4" /> {t('Send Invitation')}
      </button>
    </form>
  );
}
interface InvitationTableProps {
  invitations: Invitation[];
  busy: boolean;
  onRevokeInvite: (id: string) => void;
}
function InvitationTable({ invitations, busy, onRevokeInvite }: InvitationTableProps) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>{t('Email')}</th>
            <th className={TH}>{t('Role')}</th>
            <th className={TH}>{t('Status')}</th>
            <th className={TH}>{t('Action')}</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id}>
              <td className={TD}>{inv.email}</td>
              <td className={TD}>{inv.role}</td>
              <td className={TD}>{inv.acceptedAt ? t('Accepted') : t('Pending')}</td>
              <td className={TD}>
                {!inv.acceptedAt && (
                  <button
                    onClick={() => void onRevokeInvite(inv.id)}
                    disabled={busy}
                    title={t('Revoke Invitation')}
                    className="bg-transparent border-0 cursor-pointer text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
