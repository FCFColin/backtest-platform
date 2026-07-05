import { useCallback, useState } from 'react';
import { apiFetch } from '@/utils/apiClient';
import type { Member, Invitation } from '../components/orgMembers/types.js';

export function useOrgMembers(isAdmin: boolean) {
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
      if (!res.ok) setError((await res.json())?.detail || '更新角色失败');
      else await load();
    });
  };

  const removeMember = async (userId: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || '移除成员失败');
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
      if (!res.ok) setError((await res.json())?.detail || '发送邀请失败');
      else await load();
    });
  };

  const revokeInvite = async (id: string) => {
    await withBusy(async () => {
      const res = await apiFetch(`/api/v1/orgs/invitations/${id}`, { method: 'DELETE' });
      if (!res.ok) setError((await res.json())?.detail || '撤销邀请失败');
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
