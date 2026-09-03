import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, Zap, Database, BarChart3, Clock, HardDrive } from 'lucide-react';
import { Card, Button, Progress, Skeleton } from '@/components/ui/uiComponents';
import { TableEmpty } from '@/components/stateDisplay.js';
import { apiFetch } from '../../utils/apiClient.js';
import { useAuthStore } from '@/store/authStore';
import i18n from '@/i18n/index.js';
import { fmt, Panel } from './dataEngineDistribution.js';
import type { Stats, UniverseStats, ActionMethod } from './dataEngine.js';
const fmtStorage = (mb: number) =>
    mb >= 1024
      ? `${(mb / 1024).toFixed(2)} GB`
      : mb >= 100
        ? `${Math.round(mb)} MB`
        : `${mb.toFixed(1)} MB`,
  historyYears = (e?: string | null, l?: string | null): number | null => {
    if (!e || !l) return null;
    const y0 = parseInt(e.slice(0, 4), 10),
      y1 = parseInt(l.slice(0, 4), 10);
    return Number.isNaN(y0) || Number.isNaN(y1) || y1 < y0 ? null : y1 - y0;
  };
function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-brand">
        {icon}
        <span className="text-caption font-semibold text-fg-tertiary">{label}</span>
      </div>
      <div className="font-mono text-h1 font-bold leading-tight tabular-nums text-fg">{value}</div>
      <div className="mt-1 text-caption text-fg-tertiary">{sub}</div>
    </Card>
  );
}
function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-caption">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">
          {(current ?? 0).toLocaleString()} / {(total ?? 0).toLocaleString()} ({pct.toFixed(1)}%)
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
export function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation(),
    u = universe;
  return (
    <Card className="p-4 text-caption text-fg-tertiary">
      {t('Universe Last Refresh')}:{' '}
      {u.updated_at ? new Date(u.updated_at).toLocaleString(i18n.language) : t('Not Refreshed')}{' '}
      {' | '}
      <span className="font-mono tabular-nums">{fmt(u.total)}</span> {t('tickers')} |{' '}
      <span>
        {t('Stock')} <span className="font-mono tabular-nums">{fmt(u.stats?.stocks)}</span> + ETF{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.etfs)}</span> + {t('Index')}{' '}
        <span className="font-mono tabular-nums">{fmt(u.stats?.indices)}</span>
      </span>
      {' | '}
      <span>
        {t('US Stocks')} <span className="font-mono tabular-nums">{fmt(u.stats?.us)}</span> +{' '}
        {t('CN Stocks')} <span className="font-mono tabular-nums">{fmt(u.stats?.cn)}</span>
      </span>
    </Card>
  );
}
const effectiveRole = (user: { role: string; orgRole: string | null }): string =>
  user.orgRole ? (user.orgRole === 'owner' ? 'admin' : user.orgRole) : user.role;
const MANAGE_ACTIONS: Array<{
  url: string;
  labelKey: string;
  method: ActionMethod;
  icon: typeof Play;
}> = [
  {
    url: '/api/v1/data/manage/update/inc',
    labelKey: 'incrementalUpdate',
    method: 'PATCH',
    icon: Play,
  },
  { url: '/api/v1/data/manage/update/full', labelKey: 'fullUpdate', method: 'PUT', icon: Zap },
  {
    url: '/api/v1/data/manage/universe',
    labelKey: 'refreshUniverse',
    method: 'PUT',
    icon: Database,
  },
];
export function DataEngineActionButtons({
  actionMsg,
  fetchStats,
  doAction,
}: {
  actionMsg: string;
  fetchStats: (force?: boolean) => void;
  doAction: (url: string, label: string, method: ActionMethod) => void;
}) {
  const { t } = useTranslation(),
    user = useAuthStore((state) => state.user),
    role = user ? effectiveRole(user) : '';
  if (!(user?.platformAdmin === true || role === 'admin' || role === 'analyst')) return null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => fetchStats(true)}>
          <RefreshCw className="size-3.5" /> {t('Refresh Stats')}
        </Button>
        {MANAGE_ACTIONS.map((a) => (
          <Button
            key={a.url}
            variant="secondary"
            size="sm"
            onClick={() => doAction(a.url, t(`dataEngine.${a.labelKey}`), a.method)}
          >
            <a.icon className="size-3.5" /> {t(`dataEngine.${a.labelKey}`)}
          </Button>
        ))}{' '}
        {actionMsg && <span className="text-caption font-semibold text-brand">{actionMsg}</span>}
      </div>
    </Card>
  );
}
export function DataEngineOverviewCards({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation(),
    tu = universe?.total || stats.total_cached || 0,
    tc = stats.total_cached || 0,
    ed = stats.date_ranges.earliest,
    ld = stats.date_ranges.latest,
    yrs = historyYears(ed, ld),
    cards = [
      {
        icon: <Database className="size-5" />,
        label: t('Ticker Universe'),
        value: fmt(tu),
        sub: `${t('Cached')} ${fmt(tc)} (${tu > 0 ? ((tc / tu) * 100).toFixed(1) : 0}%)`,
      },
      {
        icon: <BarChart3 className="size-5" />,
        label: t('Total Data Points'),
        value: fmt(stats.data_quality.total_data_points || 0),
        sub: `${t('Pts/Ticker')} ${fmt(stats.coverage.avg_data_points || 0)}`,
      },
      {
        icon: <Clock className="size-5" />,
        label: t('Earliest Start'),
        value: ed || '-',
        sub:
          yrs != null && ed
            ? t('History back to {{year}} — {{years}} years of market data', {
                year: ed.slice(0, 4),
                years: yrs,
              })
            : `${t('to')} ${ld || '-'}`,
      },
      {
        icon: <HardDrive className="size-5" />,
        label: t('Database Size'),
        value: fmtStorage(stats.data_quality.total_size_mb || 0),
        sub: t('PostgreSQL tablespace (incl. indexes)'),
      },
    ];
  return (
    <div className="my-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
export function DataEngineCoverageBars({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation(),
    total = universe?.total || stats.total_cached || 0;
  return (
    <Panel title={t('Data Coverage')}>
      {[
        { l: t('Total Coverage'), c: stats.total_cached || 0 },
        { l: t('5+ Years Data'), c: stats.coverage.tickers_with_5y_plus || 0 },
        { l: t('10+ Years Data'), c: stats.coverage.tickers_with_10y_plus || 0 },
        { l: t('20+ Years Data'), c: stats.coverage.tickers_with_20y_plus || 0 },
        { l: t('Adj. Close Data'), c: stats.data_quality.with_adj_close || 0 },
      ].map((b) => (
        <ProgressBar key={b.l} label={b.l} current={b.c} total={total} />
      ))}
    </Panel>
  );
}
export function RecentUpdatesCard() {
  const { t } = useTranslation(),
    [updates, setUpdates] = useState<
      Array<{ ticker: string; name: string; lastBarDate: string | null; updatedAt: string | null }>
    >([]),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/data/recent-updates?limit=10')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          setUpdates((json?.data ?? []) as typeof updates);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUpdates([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Panel title={t('Recent Updates')} data-testid="recent-updates-card">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        <TableEmpty message={t('No recent updates')} className="text-caption" />
      ) : (
        <div className="space-y-1">
          {updates.map((u) => (
            <div
              key={u.ticker}
              className="flex items-center gap-3 py-[3px] text-caption"
              data-testid={`recent-update-${u.ticker}`}
            >
              <span className="font-mono text-fg w-20 flex-shrink-0">{u.ticker}</span>
              <span className="text-fg-secondary truncate flex-1">{u.name}</span>
              <span className="font-mono tabular-nums text-fg-tertiary">
                {u.lastBarDate ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
export function SampleTickersCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation(),
    cl: Record<string, string> = {
      us_stock: t('US Stocks'),
      us_etf: t('US ETFs'),
      cn_stock: t('CN Stocks'),
      cn_etf: t('CN ETFs'),
      index: t('Index'),
    };
  return (
    <Panel title={t('Sample Tickers')}>
      {stats.sample_tickers &&
        Object.entries(stats.sample_tickers).map(
          ([cat, items]) =>
            items.length > 0 && (
              <div key={cat} className="mb-3">
                <div className="mb-1 text-caption font-semibold text-brand">{cl[cat] || cat}</div>
                {items.map((tk) => (
                  <div
                    key={tk.ticker}
                    className="flex justify-between py-0.5 text-caption text-fg-secondary"
                  >
                    <span className="font-medium">{tk.ticker}</span>
                    <span className="text-fg-tertiary">
                      {tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}
                      {t('days')})
                    </span>
                  </div>
                ))}
              </div>
            ),
        )}
    </Panel>
  );
}
