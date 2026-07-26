/**
 * 战术配置持久化 Hook（P1-1）
 *
 * 对接后端 CRUD API /api/v1/tactical/configs，提供：
 * - list：加载已保存的战术配置列表
 * - save：保存当前策略为命名配置
 * - load：加载指定配置到当前页面状态
 * - remove：删除指定配置
 *
 * 策略对象（TacticalStrategy + 回测参数）序列化为 JSONB 存储于 PostgreSQL，
 * 由 RLS 强制租户隔离。
 */
import { useState, useCallback, useEffect } from 'react';
import { apiGetJSON, apiPostJSON, apiDeleteJSON } from '@/utils/apiClient';
import type { TacticalStrategy } from '@backtest/shared/types/tactical';
import type { RebalanceFrequency } from '@backtest/shared';

/** 后端返回的战术配置记录 */
export interface TacticalConfigRecord {
  id: string;
  name: string;
  description: string | null;
  config: TacticalConfigPayload;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/** 持久化的战术配置载荷（策略 + 回测参数） */
export interface TacticalConfigPayload {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}

/**
 * 战术配置持久化 Hook。
 *
 * @returns 配置列表、加载/保存/删除操作、加载状态
 */
export function useTacticalConfigs() {
  const [configs, setConfigs] = useState<TacticalConfigRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGetJSON<TacticalConfigRecord[]>('/api/v1/tactical/configs?limit=200');
      setConfigs(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const save = useCallback(
    async (
      name: string,
      payload: TacticalConfigPayload,
      description?: string,
    ): Promise<boolean> => {
      try {
        await apiPostJSON<TacticalConfigRecord>('/api/v1/tactical/configs', {
          name,
          description,
          config: payload,
        });
        await loadList();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [loadList],
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiDeleteJSON(`/api/v1/tactical/configs/${id}`);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, []);

  return { configs, isLoading, error, save, remove, reload: loadList };
}
