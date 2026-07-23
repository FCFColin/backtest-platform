/** @file DataEngine dashboard — composes status cards, action buttons, distribution charts */
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, RotateCcw, Zap, Database } from 'lucide-react';
import type { Stats, UniverseStats } from './utils.js';
import { fmt } from './utils.js';
import { DataEngineOverviewCards, DataEngineCoverageBars } from './DataEngineOverviewCards.js';
import {
  MarketDistributionCard,
  ExchangeDistributionCard,
  DecadeDistributionCard,
  YearCountDistributionCard,
} from './DataEngineDistributionCards.js';
import { SampleTickersCard, RecentUpdatesCard } from './DataEngineInfoCards.js';
import { useAuthStore } from '@/store/authStore';

const BTN_STYLE = {
  fontSize: 12,
  minHeight: 36,
  padding: '0 14px',
  textTransform: 'none',
} as const;

type ActionMethod = 'POST' | 'PUT' | 'PATCH';

/**
 * 解析当前用户用于权限判定的有效角色。
 *
 * 镜像后端 `effectiveRole` 逻辑（packages/backend/src/middleware/rbac.ts）：
 * 优先使用组织作用域内的角色 `orgRole`（owner 归并为 admin），无则回退到全局 `role`。
 */
function effectiveRole(user: { role: string; orgRole: string | null }): string {
  if (user.orgRole) {
    return user.orgRole === 'owner' ? 'admin' : user.orgRole;
  }
  return user.role;
}

function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <div
      className="bt-main-card card"
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

function DataEngineActionButtons({
  actionMsg,
  fetchStats,
  doAction,
}: {
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  const role = user ? effectiveRole(user) : '';
  const canManage = user?.platformAdmin === true || role === 'admin' || role === 'analyst';
  if (!canManage) return null;

  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button className="main-action-btn" style={BTN_STYLE} onClick={() => fetchStats(true)}>
          <RefreshCw className="w-3.5 h-3.5" /> {t('dataEngine.refreshStats')}
        </button>
        <button
          className="main-action-btn"
          style={{ ...BTN_STYLE, background: 'var(--support)' }}
          onClick={() =>
            doAction('/api/v1/data/manage/update/inc', t('dataEngine.incrementalUpdate'), 'PATCH')
          }
        >
          <Play className="w-3.5 h-3.5" /> {t('dataEngine.incrementalUpdate')}
        </button>
        <button
          className="main-action-btn"
          style={{ ...BTN_STYLE, background: '#6366f1' }}
          onClick={() =>
            doAction('/api/v1/data/manage/update/refetch', t('dataEngine.refetch'), 'PUT')
          }
        >
          <RotateCcw className="w-3.5 h-3.5" /> {t('dataEngine.refetch')}
        </button>
        <button
          className="main-action-btn"
          style={{ ...BTN_STYLE, background: 'var(--warning)' }}
          onClick={() =>
            doAction('/api/v1/data/manage/update/full', t('dataEngine.fullUpdate'), 'PUT')
          }
        >
          <Zap className="w-3.5 h-3.5" /> {t('dataEngine.fullUpdate')}
        </button>
        <button
          className="main-action-btn"
          style={{ ...BTN_STYLE, background: 'var(--text-muted)' }}
          onClick={() =>
            doAction('/api/v1/data/manage/universe', t('dataEngine.refreshUniverse'), 'PUT')
          }
        >
          <Database className="w-3.5 h-3.5" /> {t('dataEngine.refreshUniverse')}
        </button>
        {actionMsg && (
          <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{actionMsg}</span>
        )}
      </div>
    </div>
  );
}

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
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
  return (
    <>
      <DataEngineActionButtons actionMsg={actionMsg} fetchStats={fetchStats} doAction={doAction} />
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
      {universe && <UniverseInfo universe={universe} />}
    </>
  );
}
