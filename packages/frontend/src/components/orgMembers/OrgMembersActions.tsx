import { Mail, Send, Trash2 } from 'lucide-react';
import type { Invitation } from './types.js';
import { ROLES, TABLE_TH, TABLE_TD } from './types.js';

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

export function InviteSection({
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
