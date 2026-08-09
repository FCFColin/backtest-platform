import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Card, Button } from '@/components/ui/uiComponents';
import {
  DataEngineDashboard,
  DataEngineSkeleton,
  doFetchStats,
  doActionFn,
} from '../../components/dataEngine/dataEngine.js';
import type { Stats, UniverseStats, TFunc } from '../../components/dataEngine/dataEngine.js';
interface DataEngineAction {
  stats: Stats | null;
  universe: UniverseStats | null;
  actionMsg: string;
  error: string;
  loadStage: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: 'POST' | 'PUT' | 'PATCH') => void;
}
function useDataEngineState(): DataEngineAction {
  const { t } = useTranslation();
  const tRef = useRef<TFunc>(t as TFunc);
  tRef.current = t as TFunc;
  const [stats, setStats] = useState<Stats | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [loadStage, setLoadStage] = useState(t('Connecting...'));
  const pollCountRef = useRef(0);
  const fetchStartRef = useRef(0);
  const fetchStats = useCallback(
    (force = false) =>
      doFetchStats(
        tRef.current,
        force,
        { pollCountRef, fetchStartRef },
        { setStats, setUniverse, setError, setLoadStage },
      ),
    [],
  );
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  const doAction = useCallback(
    (url: string, label: string, method: 'POST' | 'PUT' | 'PATCH') =>
      doActionFn(tRef.current, url, label, setActionMsg, method),
    [],
  );
  return { stats, universe, actionMsg, error, loadStage, fetchStats, doAction };
}
function DataEngineError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col items-center p-10 text-center">
      <div className="mb-3 text-body leading-relaxed text-danger">{error}</div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> {t('Retry')}
      </Button>
    </Card>
  );
}
export default function DataEnginePage() {
  const { t } = useTranslation();
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } =
    useDataEngineState();
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t('Data Engine')}</h1>
      {error ? (
        <DataEngineError error={error} onRetry={() => fetchStats(true)} />
      ) : !stats ? (
        <>
          <DataEngineSkeleton />
          <div aria-live="polite" className="min-h-4 text-center text-caption text-fg-tertiary">
            {loadStage}
          </div>
        </>
      ) : (
        <DataEngineDashboard
          stats={stats}
          universe={universe}
          actionMsg={actionMsg}
          fetchStats={fetchStats}
          doAction={doAction}
        />
      )}
    </div>
  );
}
