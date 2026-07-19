/** @file DataEngine dashboard — composes status cards, action buttons, distribution charts */
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, RotateCcw, Zap, Database } from 'lucide-react';
import type { Stats, UniverseStats } from './types.js';
import { DataEngineOverviewCards, DataEngineCoverageBars } from './DataEngineOverviewCards.js';
import {
  MarketDistributionCard,
  ExchangeDistributionCard,
  DecadeDistributionCard,
  YearCountDistributionCard,
} from './DataEngineDistributionCards.js';
import { SampleTickersCard, RecentUpdatesCard, DataQualityCard } from './DataEngineInfoCards.js';

export function DataEngineDashboard({
  stats,
  universe,
  actionMsg,
  fetchStats,
  doAction,
}: {
  stats: Stats;
  universe: UniverseStats | null;
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('dataEngine.title')}</h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="main-action-btn"
            style={{ fontSize: 12, minHeight: 36, padding: '0 14px', textTransform: 'none' }}
            onClick={() => fetchStats(true)}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('dataEngine.refreshStats')}
          </button>
          <button
            className="main-action-btn"
            style={{
              fontSize: 12,
              minHeight: 36,
              padding: '0 14px',
              textTransform: 'none',
              background: 'var(--support)',
            }}
            onClick={() =>
              doAction('/api/data/manage/update/inc', t('dataEngine.incrementalUpdate'))
            }
          >
            <Play className="w-3.5 h-3.5" /> {t('dataEngine.incrementalUpdate')}
          </button>
          <button
            className="main-action-btn"
            style={{
              fontSize: 12,
              minHeight: 36,
              padding: '0 14px',
              textTransform: 'none',
              background: '#6366f1',
            }}
            onClick={() => doAction('/api/data/manage/update/refetch', t('dataEngine.refetch'))}
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t('dataEngine.refetch')}
          </button>
          <button
            className="main-action-btn"
            style={{
              fontSize: 12,
              minHeight: 36,
              padding: '0 14px',
              textTransform: 'none',
              background: 'var(--warning)',
            }}
            onClick={() => doAction('/api/data/manage/update/full', t('dataEngine.fullUpdate'))}
          >
            <Zap className="w-3.5 h-3.5" /> {t('dataEngine.fullUpdate')}
          </button>
          <button
            className="main-action-btn"
            style={{
              fontSize: 12,
              minHeight: 36,
              padding: '0 14px',
              textTransform: 'none',
              background: 'var(--text-muted)',
            }}
            onClick={() => doAction('/api/data/manage/universe', t('dataEngine.refreshUniverse'))}
          >
            <Database className="w-3.5 h-3.5" /> {t('dataEngine.refreshUniverse')}
          </button>
          {actionMsg && (
            <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
              {actionMsg}
            </span>
          )}
        </div>
      </div>
      <DataEngineOverviewCards stats={stats} universe={universe} />
      <DataEngineCoverageBars stats={stats} universe={universe} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <MarketDistributionCard stats={stats} universe={universe} />
        <ExchangeDistributionCard stats={stats} />
      </div>
      <DecadeDistributionCard stats={stats} />
      <YearCountDistributionCard stats={stats} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '8px 0' }}>
        <SampleTickersCard stats={stats} />
        <RecentUpdatesCard stats={stats} />
      </div>
      <DataQualityCard stats={stats} universe={universe} />
    </div>
  );
}
