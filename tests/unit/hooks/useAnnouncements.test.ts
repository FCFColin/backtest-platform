import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock('../../../packages/frontend/src/utils/apiClient', () => ({
  apiFetch: apiFetchMock,
  apiPostJSON: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

// 独立文件确保模块级 announceCache 为全新实例（miscHooks.test.ts 的失败用例会污染该缓存）
import { useAnnouncements } from '../../../packages/frontend/src/hooks/miscHooks';

const ANNOUNCEMENTS = [
  { id: 1, slug: 'a', title: 'A', body: 'b' },
  { id: 2, slug: 'b', title: 'B', body: 'c' },
];

describe('useAnnouncements 成功路径', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it('应展示公告并计算未读数', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: ANNOUNCEMENTS }) });
    const { result } = renderHook(() => useAnnouncements());
    await act(async () => {});
    expect(result.current.announcements).toHaveLength(2);
    expect(result.current.unreadCount).toBe(2);
  });

  it('markAllRead 应全部标记已读并持久化', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: ANNOUNCEMENTS }) });
    const { result } = renderHook(() => useAnnouncements());
    await act(async () => {});
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(JSON.parse(localStorage.getItem('announcements-read') ?? '[]')).toEqual([1, 2]);
  });

  it('localStorage 已读数据损坏时视为未读', async () => {
    localStorage.setItem('announcements-read', '{oops');
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: ANNOUNCEMENTS }) });
    const { result } = renderHook(() => useAnnouncements());
    await act(async () => {});
    expect(result.current.announcements).toHaveLength(2);
    expect(result.current.unreadCount).toBe(2);
  });
});
