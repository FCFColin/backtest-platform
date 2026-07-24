/** @file DataEngine dashboard — composes status cards, action buttons, distribution charts */
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, RotateCcw, Zap, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

type ActionMethod = 'POST' | 'PUT' | 'PATCH';

/**
 * 解析当前用户用于权限判定的有效角色。
 *
 * 镜像后端 `effectiveRole` 逻辑（packages/backend/src/middleware/rbac.ts）：
 * 优先使用组织作用域内的角色 `orgRole`（owner 归并为 admin），无则回退到全局 `role`。
 * @param user - 含 role/orgRole 的用户对象。
 * @returns 有效角色字符串。
 */
function effectiveRole(user: { role: string; orgRole: string | null }): string {
  if (user.orgRole) {
    return user.orgRole === 'owner' ? 'admin' : user.orgRole;
  }
  return user.role;
}

/**
 * UniverseInfo: 标的池刷新时间与构成摘要。
 * @param props - universe。
 * @returns 渲染的摘要卡片。
 */
function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 text-caption text-fg-tertiary">
      {t('dataEngine.universeLastRefresh')}:{' '}
      {universe.updated_at
        ? new Date(universe.updated_at).toLocaleString('zh-CN')
        : t('dataEngine.notRefreshed')}
      {' | '}
      <span className="font-mono tabular-nums">{fmt(universe.total)}</span>{' '}
      {t('dataEngine.totalTickers')}
      {' | '}
      {t('dataEngine.stock')} <span className="font-mono tabular-nums">{fmt(universe.stats?.stocks || 0)}</span> + ETF{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.etfs || 0)}</span> + {t('dataEngine.index')}{' '}
      <span className="font-mono tabular-nums">{fmt(universe.stats?.indices || 0)}</span>
      {' | '}
      {t('dataEngine.usStocks')} <span className="font-mono tabular-nums">{fmt(universe.stats?.us || 0)}</span> +{' '}
      {t('dataEngine.cnStocks')} <span className="font-mono tabular-nums">{fmt(universe.stats?.cn || 0)}</span>
    </Card>
  );
}

/**
 * DataEngineActionButtons: 数据管理动作按钮组（仅 admin/analyst 可见）。
 * @param props - actionMsg/fetchStats/doAction。
 * @returns 渲染的动作按钮卡片，无权限时返回 null。
 */
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
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => fetchStats(true)}>
          <RefreshCw className="size-3.5" /> {t('dataEngine.refreshStats')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/inc', t('dataEngine.incrementalUpdate'), 'PATCH')
          }
        >
          <Play className="size-3.5" /> {t('dataEngine.incrementalUpdate')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/refetch', t('dataEngine.refetch'), 'PUT')
          }
        >
          <RotateCcw className="size-3.5" /> {t('dataEngine.refetch')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/update/full', t('dataEngine.fullUpdate'), 'PUT')
          }
        >
          <Zap className="size-3.5" /> {t('dataEngine.fullUpdate')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            doAction('/api/v1/data/manage/universe', t('dataEngine.refreshUniverse'), 'PUT')
          }
        >
          <Database className="size-3.5" /> {t('dataEngine.refreshUniverse')}
        </Button>
        {actionMsg && (
          <span className="text-caption font-semibold text-brand">{actionMsg}</span>
        )}
      </div>
    </Card>
  );
}

/**
 * DataEngineDashboard: 数据引擎仪表盘，组合动作按钮、概览卡片、覆盖率与分布图。
 * @param props - stats/universe/actionMsg/fetchStats/doAction。
 * @returns 渲染的仪表盘。
 */
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
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MarketDistributionCard stats={stats} universe={universe} />
        <ExchangeDistributionCard stats={stats} />
      </div>
      <DecadeDistributionCard stats={stats} />
      <YearCountDistributionCard stats={stats} />
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SampleTickersCard stats={stats} />
        <RecentUpdatesCard stats={stats} />
      </div>
      {universe && <UniverseInfo universe={universe} />}
    </>
  );
}
