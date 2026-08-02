import { useState, useCallback, useEffect } from 'react';
import { apiGetJSON, apiPostJSON, apiDeleteJSON } from '@/utils/apiClient';
import type { TacticalStrategy } from '@backtest/shared/types/tactical';
import type { RebalanceFrequency } from '@backtest/shared';
export interface TacticalConfigRecord {
  id: string;
  name: string;
  description: string | null;
  config: TacticalConfigPayload;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
export interface TacticalConfigPayload {
  strategy: TacticalStrategy;
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
}
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
