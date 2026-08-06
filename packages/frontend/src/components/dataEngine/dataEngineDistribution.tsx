/* eslint-disable react-refresh/only-export-components -- 分布图卡片库，工具常量与组件同文件 */
import { type ReactNode, type HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar as RechartsBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { Card, Progress } from '@/components/ui/uiComponents';
import type { Stats, UniverseStats } from './dataEngine.js';

export const fmt = (n?: number | null) => (n ?? 0).toLocaleString();
export function Panel({
  title,
  children,
  ...rest
}: { title: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <Card className="p-4" {...rest}>
      <div className="mb-3 text-body font-semibold text-fg">{title}</div>
      {children}
    </Card>
  );
}
const BAR_FILL = '#3b82f6'; // Blue-500 from PORTFOLIO_COLORS
const AXIS_TICK_COLOR = 'var(--text-muted)';
const DECADE_ORDER = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
function sortAgeBucketEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => {
    const am = a[0].match(/^(\d+)/);
    const bm = b[0].match(/^(\d+)/);
    return (am ? parseInt(am[1], 10) : 999) - (bm ? parseInt(bm[1], 10) : 999);
  });
}
function sortDecadeEntries(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => {
    const ai = DECADE_ORDER.indexOf(a[0]);
    const bi = DECADE_ORDER.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
function DistributionRow({
  label,
  count,
  maxCount,
  bold = false,
}: {
  label: string;
  count: number;
  maxCount: number;
  bold?: boolean;
}) {
  const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="mb-1.5">
      <div className="mb-0.75 flex justify-between text-label">
        <span className={`text-fg-secondary ${bold ? 'font-semibold' : ''}`}>{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">{fmt(count)}</span>
      </div>
      <Progress value={barPct} />
    </div>
  );
}
export function MarketDistributionCard({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const marketEntries = stats.by_market ? Object.entries(stats.by_market) : [];
  const maxCount =
    marketEntries.length > 0 ? Math.max(...marketEntries.map(([, d]) => d.count)) : 0;
  const labelOf = (market: string) =>
    market === 'US' ? t('US Stock') : market === 'CN' ? t('CN Stock') : market;
  return (
    <Panel title={t('By Market')}>
      {marketEntries.map(([market, data]) => (
        <div key={market} className="mb-2.5">
          <div className="mb-0.75 flex justify-between text-label">
            <span className="font-semibold text-fg-secondary">{labelOf(market)}</span>
            <span className="font-mono tabular-nums text-fg-tertiary">{fmt(data.count)}</span>
          </div>
          <Progress value={maxCount > 0 ? (data.count / maxCount) * 100 : 0} />
          <div className="mt-[3px] flex gap-3 text-caption text-fg-tertiary">
            <span>
              {t('Stock')} {data.stocks}
            </span>
            <span>
              {t('ETF')} {data.etfs}
            </span>
            {data.indices > 0 && (
              <span>
                {t('Index')} {data.indices}
              </span>
            )}
          </div>
        </div>
      ))}
      {universe?.stats && (universe.stats.us != null || universe.stats.cn != null) && (
        <div className="mt-3 border-t border-subtle pt-3 text-caption text-fg-tertiary">
          <div className="mb-1 font-semibold">{t('Universe vs Cache')}</div>
          <div>
            {t('US Stocks')}: {fmt(universe.stats.us)} → {t('Cached')}{' '}
            {fmt(stats.by_market?.US?.count)}
          </div>
          <div>
            {t('CN Stocks')}: {fmt(universe.stats.cn)} → {t('Cached')}{' '}
            {fmt(stats.by_market?.CN?.count)}
          </div>
        </div>
      )}
    </Panel>
  );
}
export function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const entries = stats.by_exchange
    ? Object.entries(stats.by_exchange)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 10)
    : [];
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c)) : 0;
  return (
    <Panel title={t('By Exchange (Top 10)')}>
      {entries.map(([exchange, count]) => (
        <DistributionRow
          key={exchange}
          label={exchange || t('Unknown')}
          count={count}
          maxCount={maxCount}
        />
      ))}
    </Panel>
  );
}
export function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_decade ? sortDecadeEntries(Object.entries(stats.by_decade)) : [];
  return <DistributionBarCard titleKey="dataEngine.byDecade" entries={entries} />;
}
export function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_year_count
    ? sortAgeBucketEntries(Object.entries(stats.by_year_count))
    : [];
  return <DistributionBarCard titleKey="dataEngine.byYearCount" entries={entries} />;
}
function DistributionBarCard({
  titleKey,
  entries,
}: {
  titleKey: string;
  entries: [string, number][];
}) {
  const { t } = useTranslation();
  const data = entries.map(([bucket, count]) => ({ bucket, count }));
  const rotate = entries.length > 8;
  return (
    <Panel title={t(titleKey)}>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10, fill: AXIS_TICK_COLOR }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-soft)' }}
              interval={0}
              angle={rotate ? -35 : 0}
              textAnchor={rotate ? 'end' : 'middle'}
              height={rotate ? 50 : 30}
            />
            <YAxis hide />
            <RechartsBar dataKey="count" fill={BAR_FILL} radius={[3, 3, 0, 0]} maxBarSize={60}>
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'monospace' }}
                formatter={(v: number) => fmt(v)}
              />
              {data.map((entry) => (
                <Cell key={entry.bucket} fill={BAR_FILL} />
              ))}
            </RechartsBar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
