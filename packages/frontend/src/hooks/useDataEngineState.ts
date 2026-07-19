/** @file DataEngine state management hook */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Stats, UniverseStats, TFunc } from '../components/dataEngine/types.js';
import { doFetchStats, doActionFn } from '../components/dataEngine/utils.js';

interface DataEngineAction {
  stats: Stats | null;
  universe: UniverseStats | null;
  actionMsg: string;
  error: string;
  loadStage: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string) => void;
}

export function useDataEngineState(): DataEngineAction {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [loadStage, setLoadStage] = useState(t('dataEngine.connecting'));
  const [, setScanning] = useState(false);
  const pollCountRef = useRef(0);
  const fetchStartRef = useRef(0);

  const fetchStats = useCallback(
    (force = false) =>
      doFetchStats(
        t as TFunc,
        force,
        { pollCountRef, fetchStartRef },
        { setStats, setUniverse, setLoading, setError, setLoadStage, setScanning },
      ),
    [t],
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const doAction = (url: string, label: string) => doActionFn(t as TFunc, url, label, setActionMsg);

  return { stats, universe, actionMsg, error, loadStage, fetchStats, doAction };
}
