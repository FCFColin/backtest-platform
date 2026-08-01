import { useEffect, useState } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Users, Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { StandardPageShell } from '../components/shells/index.js';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
import { useOrgMembersState } from './org/hooks/useOrgMembersState.js';
import {
  ROLES,
  TABLE_TD,
  TABLE_TH,
  type Invitation,
  type Member,
  type Role,
} from './org/orgTypes.js';
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
          <Link to="/login" style={{ color: 'hsl(var(--brand))' }}>
            {t('orgMembers.unauthed.login')}
          </Link>{' '}
          {t('orgMembers.unauthed.suffix')}
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
        headerExtra: <Users className="w-5 h-5" style={{ color: 'hsl(var(--brand))' }} />,
      }}
    >
      <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
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
    </StandardPageShell>
  );
}
interface RoleSelectProps {
  value: string;
  disabled?: boolean;
  onChange: (role: Role) => void;
  className?: string;
  style?: CSSProperties;
}
function RoleSelect({ value, disabled, onChange, className, style }: RoleSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className={className}
      style={style}
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
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={TABLE_TH}>{t('orgMembers.table.user')}</th>
            <th style={TABLE_TH}>{t('orgMembers.table.email')}</th>
            <th style={TABLE_TH}>{t('orgMembers.table.role')}</th>
            {isAdmin && <th style={TABLE_TH}>{t('orgMembers.table.action')}</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td style={TABLE_TD}>{m.username}</td>
              <td style={TABLE_TD}>{m.email ?? '-'}</td>
              <td style={TABLE_TD}>
                {isAdmin && m.role !== 'owner' ? (
                  <RoleSelect
                    value={m.role}
                    disabled={busy}
                    onChange={(r) => void onChangeRole(m.userId, r)}
                    className="bg-input-bg text-fg border border-border-subtle rounded font-medium"
                    style={{ height: 32 }}
                  />
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
                      title={t('orgMembers.invite.removeTitle')}
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
        <Mail className="w-4 h-4" /> {t('orgMembers.invite.title')}
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
    <form
      onSubmit={(e) => void onSendInvite(e)}
      style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}
    >
      <input
        type="email"
        required
        placeholder={t('orgMembers.invite.emailPlaceholder')}
        value={inviteEmail}
        onChange={(e) => onInviteEmailChange(e.target.value)}
        className="bg-input-bg text-fg border border-border-subtle rounded font-medium"
        style={{ height: 38, flex: '1 1 220px' }}
      />
      <RoleSelect
        value={inviteRole}
        onChange={onInviteRoleChange}
        className="bg-input-bg text-fg border border-border-subtle rounded font-medium"
        style={{ height: 38 }}
      />
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
        <Send className="w-4 h-4" /> {t('orgMembers.invite.send')}
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
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TABLE_TH}>{t('orgMembers.invite.tableEmail')}</th>
            <th style={TABLE_TH}>{t('orgMembers.invite.tableRole')}</th>
            <th style={TABLE_TH}>{t('orgMembers.invite.tableStatus')}</th>
            <th style={TABLE_TH}>{t('orgMembers.invite.tableAction')}</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id}>
              <td style={TABLE_TD}>{inv.email}</td>
              <td style={TABLE_TD}>{inv.role}</td>
              <td style={TABLE_TD}>
                {inv.acceptedAt ? t('orgMembers.invite.accepted') : t('orgMembers.invite.pending')}
              </td>
              <td style={TABLE_TD}>
                {!inv.acceptedAt && (
                  <button
                    onClick={() => void onRevokeInvite(inv.id)}
                    disabled={busy}
                    title={t('orgMembers.invite.revokeTitle')}
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
    </div>
  );
}
