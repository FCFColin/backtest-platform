/**
 * @file 组织成员管理状态 hook
 * @description 承载 OrgMembersPage 的全部 state 与副作用：成员/邀请列表加载、
 *              角色变更、移除成员、发送/撤销邀请。所有写操作通过 busy 状态串行化，
 *              失败时回填 error 供 UI 展示；UI 仅消费返回值，不直接持有 API 逻辑。
 */
import { useCallback, useState } from 'react';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../../../i18n/index.js';
import type { Member, Invitation } from '../orgTypes.js';

/** useOrgMembersState 返回的状态与操作集合 */
interface UseOrgMembersStateResult {
  members: Member[];
  invitations: Invitation[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  load: () => Promise<void>;
  changeRole: (userId: string, role: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  sendInvite: (email: string, role: string) => Promise<void>;
  revokeInvite: (id: string) => Promise<void>;
}

/**
 * 组织成员管理状态 hook。
 *
 * @param isAdmin - 当前用户是否为 owner/admin，决定是否加载邀请列表。
 * @returns 成员/邀请数据、加载与错误状态，以及变更操作。
 */
export function useOrgMembersState(isAdmin: boolean): UseOrgMembersStateResult {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes] = await Promise.all([
        apiFetch('/api/v1/orgs/members'),
        isAdmin ? apiFetch('/api/v1/orgs/invitations') : Promise.resolve(null),
      ]);
      if (mRes.ok) setMembers((await mRes.json())?.data ?? []);
      if (iRes && iRes.ok) setInvitations((await iRes.json())?.data ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const changeRole = async (userId: string, role: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) setError((await res.json())?.detail || i18n.t('orgMembers.error.updateRole'));
      else await load();
    });
  };

  const removeMember = async (userId: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || i18n.t('orgMembers.error.removeMember'));
      else await load();
    });
  };

  const sendInvite = async (email: string, role: string) => {
    await withBusy(async () => {
      setError(null);
      const res = await apiFetch('/api/v1/orgs/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) setError((await res.json())?.detail || i18n.t('orgMembers.error.sendInvite'));
      else await load();
    });
  };

  const revokeInvite = async (id: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/invitations/${id}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || i18n.t('orgMembers.error.revokeInvite'));
      else await load();
    });
  };

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
