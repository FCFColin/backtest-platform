import { useTranslation } from 'react-i18next';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useDataEngineState } from '../../hooks/useDataEngineState.js';
import { DataEngineDashboard } from '../../components/dataEngine/DataEngineDashboard.js';
import { fmt } from '../../components/dataEngine/utils.js';
import type { UniverseStats } from '../../components/dataEngine/types.js';

function DataEngineLoading({
  error,
  loadStage,
  onRetry,
}: {
  error: string;
  loadStage: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>
      <div
        className="bt-main-card card"
        style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}
      >
        {error ? (
          <>
            <div
              style={{ marginBottom: 12, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}
            >
              {error}
            </div>
            <button
              className="main-action-btn"
              style={{ fontSize: 12, minHeight: 36, padding: '0 18px', textTransform: 'none' }}
              onClick={onRetry}
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('common.retry')}
            </button>
          </>
        ) : (
          <>
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            {loadStage}
          </>
        )}
      </div>
    </div>
  );
}

function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <div
      className="bt-seo-card card"
      style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}
    >
      {t('dataEngine.universeLastRefresh')}:{' '}
      {universe.updated_at
        ? new Date(universe.updated_at).toLocaleString('zh-CN')
        : t('dataEngine.notRefreshed')}
      {' | '}
      {fmt(universe.total)} {t('dataEngine.totalTickers')}
      {' | '}
      {t('dataEngine.stock')} {fmt(universe.stats?.stocks || 0)} + ETF{' '}
      {fmt(universe.stats?.etfs || 0)} + {t('dataEngine.index')} {fmt(universe.stats?.indices || 0)}
      {' | '}
      {t('dataEngine.usStocks')} {fmt(universe.stats?.us || 0)} + {t('dataEngine.cnStocks')}{' '}
      {fmt(universe.stats?.cn || 0)}
    </div>
  );
}

export default function DataEnginePage() {
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } =
    useDataEngineState();

  if (!stats)
    return (
      <DataEngineLoading error={error} loadStage={loadStage} onRetry={() => fetchStats(true)} />
    );

  return (
    <>
      <DataEngineDashboard
        stats={stats}
        universe={universe}
        actionMsg={actionMsg}
        fetchStats={fetchStats}
        doAction={doAction}
      />
      {universe && <UniverseInfo universe={universe} />}
    </>
  );
}
