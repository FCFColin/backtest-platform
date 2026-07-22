import { useState, useCallback } from 'react';
import { apiFetch } from '../utils/apiClient.js';
import { usePolling } from './usePolling.js';

export type EngineStatus = 'ok' | 'degraded' | 'error' | 'loading';

interface EngineHealth {
  status: EngineStatus;
  go: boolean;
  dataFetcher: boolean;
  dataFreshness: string | null;
}

const DEFAULT_HEALTH: EngineHealth = {
  status: 'loading',
  go: false,
  dataFetcher: false,
  dataFreshness: null,
};

const POLL_INTERVAL = 30_000; // 30 秒

export function useEngineHealth(): EngineHealth & { refresh: () => void } {
  const [health, setHealth] = useState<EngineHealth>(DEFAULT_HEALTH);

  const fetchHealth = useCallback(async () => {
    const t0 = Date.now();
    try {
      const response = await apiFetch('/api/health');
      const json = await response.json();
      if (json.success && json.data) {
        console.debug(`[useEngineHealth] /api/health 耗时 ${Date.now() - t0}ms`);
        setHealth({
          status: json.data.status,
          go: json.data.engine?.go ?? false,
          dataFetcher: json.data.dataFetcher ?? false,
          dataFreshness: json.data.dataFreshness ?? null,
        });
      }
    } catch {
      setHealth({
        status: 'error',
        go: false,
        dataFetcher: false,
        dataFreshness: null,
      });
    }
  }, []);

  usePolling(fetchHealth, POLL_INTERVAL, { deps: [fetchHealth] });

  return { ...health, refresh: fetchHealth };
}
