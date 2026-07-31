import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/utils/apiClient.js';
export interface Announcement {
  id: number;
  slug: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaLink?: string;
  variant: 'info' | 'success' | 'warning';
  publishedAt: string;
}
const READ_KEY = 'announcements-read';
let pendingAnnouncementsPromise: Promise<Announcement[]> | null = null;
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const saved = localStorage.getItem(READ_KEY);
      if (saved) setReadIds(new Set(JSON.parse(saved)));
    } catch {
      // localStorage 不可用时视为无已读记录
    }
    if (!pendingAnnouncementsPromise) {
      pendingAnnouncementsPromise = apiFetch('/api/v1/announcements', { silent: true })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((json) => {
          const data = json.data ?? json ?? [];
          return Array.isArray(data) ? data : [];
        })
        .catch(() => [])
        .finally(() => {
          pendingAnnouncementsPromise = null;
        });
    }
    pendingAnnouncementsPromise.then((data) => setAnnouncements(data));
  }, []);
  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;
  const markAllRead = useCallback(() => {
    const allIds = new Set(announcements.map((a) => a.id));
    setReadIds(allIds);
    localStorage.setItem(READ_KEY, JSON.stringify([...allIds]));
  }, [announcements]);
  return { announcements, unreadCount, markAllRead };
}
