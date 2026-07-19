/**
 * @file 成员表格组件
 * @description 展示组织成员列表。admin 可在此调整非 owner 成员的角色或将其移除；
 *              非 admin 仅展示。角色下拉与移除按钮的可用性受 busy 控制，避免并发写。
 */
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { TABLE_TD, TABLE_TH, type Member } from './orgTypes.js';
import { RoleSelect } from './RoleSelect.js';

interface MemberTableProps {
  members: Member[];
  isAdmin: boolean;
  busy: boolean;
  onChangeRole: (userId: string, role: string) => void;
  onRemoveMember: (userId: string) => void;
}

/** 成员表格，admin 行内显示角色下拉与移除按钮 */
export function MemberTable({
  members,
  isAdmin,
  busy,
  onChangeRole,
  onRemoveMember,
}: MemberTableProps) {
  const { t } = useTranslation();
  return (
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
            <td style={TABLE_TD}>{m.email ?? '—'}</td>
            <td style={TABLE_TD}>
              {isAdmin && m.role !== 'owner' ? (
                <RoleSelect
                  value={m.role}
                  disabled={busy}
                  onChange={(r) => void onChangeRole(m.userId, r)}
                  className="portfolio-rebalance-select"
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
  );
}
