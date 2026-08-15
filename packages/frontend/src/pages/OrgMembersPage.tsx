import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { StandardPageShell } from '../components/shells/index.js';
import { useOrgAuth } from '@/hooks/miscHooks';
import { useConfirmDialog } from '@/components/confirmDialog';
import { ErrorBanner } from '@/components/stateDisplay';
import { ErrorBanner } from '@/components/stateDisplay';
import { useOrgMembersState } from './org/hooks/useOrgMembersState.js';
import { ROLES, type Invitation, type Member, type Role } from './org/orgTypes.js';
import { Button, Card } from '@/components/ui/uiComponents';
const TH = 'text-left text-xs font-semibold text-fg-tertiary px-[10px] py-2';
const TD = 'text-label text-fg-secondary py-2 px-[10px]';
export default function OrgMembersPage() {
  const { t } = useTranslation();
  const { org, isAdmin } = useOrgAuth();
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
    void load();
  }, [load]);
  return (
    <StandardPageShell
      config={{
        titleKey: 'Org Members',
        headerExtra: <Users className="w-5 h-5 text-brand" />,
      }}
    >
      <Card className="p-6 mt-7">
        <p className="text-label text-fg-tertiary mb-4">
          {org ? `${t('Organization:')}${org.name}` : t('Organization:')}
        </p>
        {error ? (
          <ErrorBanner message={error} style={{ marginBottom: 14 }} />
        ) : loading ? (
          <div className="p-[30px] text-center text-fg-tertiary">
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
                busy={busy}
                sendInvite={sendInvite}
                onRevokeInvite={revokeInvite}
              />
            )}
          </>
        )}
      </Card>
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
  const [confirmDialog, confirm] = useConfirmDialog();
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
                      onClick={() =>
                        confirm(
                          t('Remove member {{name}}? This cannot be undone.', {
                            name: m.username,
                          }),
                          () => onRemoveMember(m.userId),
                          true,
                        )
                      }
                      disabled={busy}
                      title={t('Remove Member')}
                      className="inline-flex items-center bg-transparent border-0 cursor-pointer text-danger"
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
      {confirmDialog}
    </div>
  );
}
function InviteDialog({
  invitations,
  busy,
  sendInvite,
  onRevokeInvite,
}: {
  invitations: Invitation[];
  busy: boolean;
  sendInvite: (email: string, role: Role) => Promise<void>;
  onRevokeInvite: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('analyst');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void sendInvite(email, role).then(() => setEmail(''));
  };
  return (
    <div>
      <h2 className="text-[15px] font-bold text-fg flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4" /> {t('Invite Member')}
      </h2>
      <form onSubmit={submit} className="flex gap-2 mb-4 flex-wrap">
        <input
          type="email"
          required
          placeholder={t('Invite email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[38px] flex-[1_1_220px]"
        />
        <RoleSelect
          value={role}
          onChange={setRole}
          className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[38px]"
        />
        <Button type="submit" variant="primary" className="h-[38px] px-4" disabled={busy}>
          <Send className="w-4 h-4" /> {t('Send Invitation')}
        </Button>
      </form>
      {invitations.length > 0 && (
        <InvitationTable invitations={invitations} busy={busy} onRevokeInvite={onRevokeInvite} />
      )}
    </div>
  );
}
interface InvitationTableProps {
  invitations: Invitation[];
  busy: boolean;
  onRevokeInvite: (id: string) => void;
}
function InvitationTable({ invitations, busy, onRevokeInvite }: InvitationTableProps) {
  const { t } = useTranslation();
  const [confirmDialog, confirm] = useConfirmDialog();
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
                    onClick={() =>
                      confirm(
                        t('Revoke invitation for {{email}}?', { email: inv.email }),
                        () => onRevokeInvite(inv.id),
                        true,
                      )
                    }
                    disabled={busy}
                    title={t('Revoke Invitation')}
                    className="inline-flex items-center bg-transparent border-0 cursor-pointer text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirmDialog}
    </div>
  );
}
