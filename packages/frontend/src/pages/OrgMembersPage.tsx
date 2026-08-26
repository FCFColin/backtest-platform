import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { StandardPageShell } from '../components/shells/index.js';
import { useOrgAuth } from '@/hooks/miscHooks';
import { useConfirmDialog } from '@/components/confirmDialog';
import { ErrorBanner } from '@/components/stateDisplay';
import { Button, Card } from '@/components/ui/uiComponents';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../i18n/index.js';
import type { OrgRole } from '@backtest/shared/types/org';

type Member = { userId: string; username: string; email: string | null; role: string };
type Invitation = { id: string; email: string; role: string; acceptedAt: string | null };
const ROLES = ['admin', 'analyst', 'readonly'] as const;
type Role = Exclude<OrgRole, 'owner'>;
const TH = 'text-left text-xs font-semibold text-fg-tertiary px-[10px] py-2';
const TD = 'text-label text-fg-secondary py-2 px-[10px]';
const INPUT = 'bg-input-bg text-fg border border-border-subtle rounded font-medium';
const DEL_BTN = 'inline-flex items-center bg-transparent border-0 cursor-pointer text-danger';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function useOrgMembersState(admin: boolean) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes] = await Promise.all([
        apiFetch('/api/v1/orgs/members'),
        admin ? apiFetch('/api/v1/orgs/invitations') : Promise.resolve(null),
      ]);
      if (mRes.ok) setMembers((await mRes.json())?.data ?? []);
      if (iRes && iRes.ok) setInvitations((await iRes.json())?.data ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [admin]);
  const req = (url: string, method: string, body?: unknown) =>
    body === undefined
      ? apiFetch(url, { method })
      : apiFetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
  const act = async (failMsg: string, doReq: () => Promise<Response>, clearError = false) => {
    setBusy(true);
    try {
      if (clearError) setError(null);
      const res = await doReq();
      if (res.ok) await load();
      else setError((await res.json())?.detail || i18n.t(failMsg));
    } finally {
      setBusy(false);
    }
  };
  const changeRole = (userId: string, role: string) =>
    act('Failed to update role', () => req(`/api/v1/orgs/members/${userId}`, 'PATCH', { role }));
  const removeMember = (userId: string) =>
    act('Failed to remove member', () => req(`/api/v1/orgs/members/${userId}`, 'DELETE'));
  const sendInvite = (email: string, role: string) =>
    act(
      'Failed to send invitation',
      () => req('/api/v1/orgs/invitations', 'POST', { email: email.trim(), role }),
      true,
    );
  const revokeInvite = (id: string) =>
    act('Failed to revoke invitation', () => req(`/api/v1/orgs/invitations/${id}`, 'DELETE'));
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

export default function OrgMembersPage() {
  const { t } = useTranslation();
  const { org, isAdmin } = useOrgAuth();
  const s = useOrgMembersState(isAdmin);
  const { load } = s;
  useEffect(() => void load(), [load]);
  return (
    <StandardPageShell
      config={{ titleKey: 'Org Members', headerExtra: <Users className="w-5 h-5 text-brand" /> }}
    >
      <Card className="p-6 mt-7">
        <p className="text-label text-fg-tertiary mb-4">{t('Organization:') + (org?.name ?? '')}</p>
        {s.error ? (
          <ErrorBanner message={s.error} style={{ marginBottom: 14 }} />
        ) : s.loading ? (
          <div className="p-[30px] text-center text-fg-tertiary">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <MemberTable
              members={s.members}
              admin={isAdmin}
              busy={s.busy}
              onRole={s.changeRole}
              onRemove={s.removeMember}
            />
            {isAdmin && (
              <InviteDialog
                invitations={s.invitations}
                busy={s.busy}
                invite={s.sendInvite}
                onRevoke={s.revokeInvite}
              />
            )}
          </>
        )}
      </Card>
    </StandardPageShell>
  );
}

function TableHead({ labels }: { labels: string[] }) {
  const { t } = useTranslation();
  return (
    <thead>
      <tr>
        {labels.map((l) => (
          <th key={l} scope="col" className={TH}>
            {t(l)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RoleSelect({
  value,
  disabled,
  className,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  onChange: (role: Role) => void;
}) {
  return (
    <select {...{ value, disabled, className }} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  );
}

function ConfirmTrash({
  question,
  title,
  disabled,
  onConfirm,
}: {
  question: string;
  title: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [dialog, confirm] = useConfirmDialog();
  return (
    <>
      <button
        onClick={() => confirm(question, onConfirm, true)}
        disabled={disabled}
        title={title}
        className={DEL_BTN}
      >
        <Trash2 className="w-4 h-4" />
      </button>
      {dialog}
    </>
  );
}

function MemberTable({
  members,
  admin,
  busy,
  onRole,
  onRemove,
}: {
  members: Member[];
  admin: boolean;
  busy: boolean;
  onRole: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse mb-6">
        <TableHead labels={['User', 'Email', 'Role', ...(admin ? ['Action'] : [])]} />
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td className={TD}>{m.username}</td>
              <td className={TD}>{m.email ?? '-'}</td>
              <td className={TD}>
                {admin && m.role !== 'owner' ? (
                  <RoleSelect
                    value={m.role}
                    disabled={busy}
                    onChange={(r) => void onRole(m.userId, r)}
                    className={`${INPUT} h-[32px]`}
                  />
                ) : (
                  <span className="capitalize">{m.role}</span>
                )}
              </td>
              {admin && (
                <td className={TD}>
                  {m.role !== 'owner' && (
                    <ConfirmTrash
                      question={t('Remove member {{name}}? This cannot be undone.', {
                        name: m.username,
                      })}
                      title={t('Remove Member')}
                      disabled={busy}
                      onConfirm={() => onRemove(m.userId)}
                    />
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

function InviteDialog({
  invitations,
  busy,
  invite,
  onRevoke,
}: {
  invitations: Invitation[];
  busy: boolean;
  invite: (email: string, role: Role) => Promise<void>;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('analyst');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void invite(email, role).then(() => setEmail(''));
  };
  return (
    <div>
      <h2 className="text-h3 font-bold text-fg flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4" /> {t('Invite Member')}
      </h2>
      <form onSubmit={submit} className="flex gap-2 mb-4 flex-wrap">
        <input
          type="email"
          required
          placeholder={t('Invite email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${INPUT} h-[38px] flex-[1_1_220px]`}
        />
        <RoleSelect value={role} onChange={setRole} className={`${INPUT} h-[38px]`} />
        <Button type="submit" variant="primary" className="h-[38px] px-4" disabled={busy}>
          <Send className="w-4 h-4" /> {t('Send Invitation')}
        </Button>
      </form>
      {invitations.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <TableHead labels={['Email', 'Role', 'Status', 'Action']} />
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td className={TD}>{inv.email}</td>
                  <td className={TD}>{inv.role}</td>
                  <td className={TD}>{inv.acceptedAt ? t('Accepted') : t('Pending')}</td>
                  <td className={TD}>
                    {!inv.acceptedAt && (
                      <ConfirmTrash
                        question={t('Revoke invitation for {{email}}?', { email: inv.email })}
                        title={t('Revoke Invitation')}
                        disabled={busy}
                        onConfirm={() => onRevoke(inv.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
