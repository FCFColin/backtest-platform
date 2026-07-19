/**
 * @file 邀请区组件
 * @description 包含邀请表单（邮箱 + 角色）与已发送邀请列表（含撤销操作）。
 *              仅在 admin 视图下由 OrgMembersPage 渲染；非 admin 不显示。
 *              内部拆出 InviteForm / InvitationTable 两个私有子组件以控制单函数行数。
 */
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Send, Trash2 } from 'lucide-react';
import { TABLE_TD, TABLE_TH, type Invitation, type Role } from './orgTypes.js';
import { RoleSelect } from './RoleSelect.js';

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

/** 邀请区：标题 + 邀请表单 + 待接受邀请列表 */
export function InviteDialog({
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
        className="portfolio-rebalance-select"
        style={{ height: 38, flex: '1 1 220px' }}
      />
      <RoleSelect
        value={inviteRole}
        onChange={onInviteRoleChange}
        className="portfolio-rebalance-select"
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
  );
}
