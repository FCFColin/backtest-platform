import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useDataEngineState } from '../../hooks/useDataEngineState.js';
import { DataEngineDashboard } from '../../components/dataEngine/DataEngineDashboard.js';
import { DataEngineSkeleton } from '../../components/dataEngine/DataEngineSkeleton.js';

function DataEngineError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="bt-main-card card"
      style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}
    >
      <div style={{ marginBottom: 12, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}>
        {error}
      </div>
      <button
        className="main-action-btn"
        style={{ fontSize: 12, minHeight: 36, padding: '0 18px', textTransform: 'none' }}
        onClick={onRetry}
      >
        <RotateCcw className="w-3.5 h-3.5" /> {t('common.retry')}
      </button>
    </div>
  );
}

export default function DataEnginePage() {
  const { t } = useTranslation();
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } =
    useDataEngineState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>
      {error ? (
        <DataEngineError error={error} onRetry={() => fetchStats(true)} />
      ) : !stats ? (
        <>
          <DataEngineSkeleton />
          <div
            aria-live="polite"
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              marginTop: 8,
              minHeight: 16,
            }}
          >
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
