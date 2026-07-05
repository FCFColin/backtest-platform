import { Trash2 } from 'lucide-react';
import type { Member } from './types.js';
import { ROLES, TABLE_TH, TABLE_TD } from './types.js';

interface MembersTableProps {
  members: Member[];
  isAdmin: boolean;
  busy: boolean;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
}

export function MembersTable({ members, isAdmin, busy, onChangeRole, onRemoveMember }: MembersTableProps) {
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
