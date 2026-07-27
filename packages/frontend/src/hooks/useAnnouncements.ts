/**
 * @file useAnnouncements hook
 * @description 从后端获取公告列表，管理已读状态（localStorage）。
 */
import { useState, useEffect, useCallback } from 'react';

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

/**
 * 获取公告列表 + 未读计数 + markAllRead。
 * @returns announcements/unreadCount/markAllRead。
 */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(READ_KEY);
      if (saved) setReadIds(new Set(JSON.parse(saved)));
    } catch {
      // 忽略
    }

    fetch('/api/v1/announcements')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => {
        const data = json.data ?? json ?? [];
        if (Array.isArray(data)) setAnnouncements(data);
      })
      .catch(() => {
        setAnnouncements([]);
      });
  }, []);

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  const markAllRead = useCallback(() => {
    const allIds = new Set(announcements.map((a) => a.id));
    setReadIds(allIds);
    localStorage.setItem(READ_KEY, JSON.stringify([...allIds]));
  }, [announcements]);

  return { announcements, unreadCount, markAllRead };
}
