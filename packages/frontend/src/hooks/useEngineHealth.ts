import { useState, useEffect, useCallback } from 'react';

export type EngineStatus = 'ok' | 'degraded' | 'error' | 'loading';

export interface EngineHealth {
  status: EngineStatus;
  go: boolean;
  node: boolean;
  dataFetcher: boolean;
  dataFreshness: string | null;
}

const DEFAULT_HEALTH: EngineHealth = {
  status: 'loading',
  go: false,
  node: true,
  dataFetcher: false,
  dataFreshness: null,
};

const POLL_INTERVAL = 30_000; // 30 秒

export function useEngineHealth(): EngineHealth & { refresh: () => void } {
  const [health, setHealth] = useState<EngineHealth>(DEFAULT_HEALTH);

  const fetchHealth = useCallback(async () => {
    const t0 = Date.now();
    try {
      const response = await fetch('/api/health');
      const json = await response.json();
      if (json.success && json.data) {
        console.debug(`[useEngineHealth] /api/health 耗时 ${Date.now() - t0}ms`);
        setHealth({
          status: json.data.status,
          go: json.data.engine?.go ?? false,
          node: json.data.engine?.node ?? true,
          dataFetcher: json.data.dataFetcher ?? false,
          dataFreshness: json.data.dataFreshness ?? null,
        });
      }
    } catch {
      setHealth({
        status: 'error',
        go: false,
        node: false,
        dataFetcher: false,
        dataFreshness: null,
      });
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { ...health, refresh: fetchHealth };
}
