import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import type { Stats, UniverseStats } from './utils.js';
import { fmt } from './utils.js';

/** 柱状图品牌色（SVG fill，沿用 base.css 的 --brand 全色值） */
const BAR_FILL = '#3b82f6'; // Blue-500 from PORTFOLIO_COLORS
/** 柱状图文字颜色（SVG fill，沿用 base.css 的 --text-muted 全色值） */
const AXIS_TICK_COLOR = 'var(--text-muted)';

/** 迷你条形指示器（4px 高，品牌色，按比例填充） */
function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 overflow-hidden rounded bg-input-bg">
      <div
        className="h-full rounded bg-brand transition-[width] duration-400"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** 分布行：标签 + 数值 + 迷你条形指示器 */
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
      <div className="mb-0.75 flex justify-between text-[13px]">
        <span className={`text-fg-secondary ${bold ? 'font-semibold' : ''}`}>{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">{fmt(count)}</span>
      </div>
      <MiniBar pct={barPct} />
    </div>
  );
}

/**
 * MarketDistributionCard: 按市场（US/CN）分布卡片。
 * @param props - stats/universe。
 * @returns 渲染的市场分布卡片。
 */
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
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byMarket')}</div>
      {marketEntries.map(([market, data]) => {
        const label =
          market === 'US'
            ? t('dataEngine.usStock')
            : market === 'CN'
              ? t('dataEngine.cnStock')
              : market;
        return (
          <div key={market} className="mb-2.5">
            <div className="mb-[3px] flex justify-between text-[13px]">
              <span className="font-semibold text-fg-secondary">{label}</span>
              <span className="font-mono tabular-nums text-fg-tertiary">{fmt(data.count)}</span>
            </div>
            <MiniBar pct={maxCount > 0 ? (data.count / maxCount) * 100 : 0} />
            <div className="mt-[3px] flex gap-3 text-caption text-fg-tertiary">
              <span>
                {t('dataEngine.stock')} {data.stocks}
              </span>
              <span>
                {t('dataEngine.etf')} {data.etfs}
              </span>
              {data.indices > 0 && (
                <span>
                  {t('dataEngine.index')} {data.indices}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {universe?.stats && (universe.stats.us != null || universe.stats.cn != null) && (
        <div className="mt-3 border-t border-subtle pt-3 text-caption text-fg-tertiary">
          <div className="mb-1 font-semibold">{t('dataEngine.universeVsCache')}</div>
          <div>
            {t('dataEngine.usStocks')}: {fmt(universe.stats.us)} → {t('dataEngine.cached')}{' '}
            {fmt(stats.by_market?.US?.count)}
          </div>
          <div>
            {t('dataEngine.cnStocks')}: {fmt(universe.stats.cn)} → {t('dataEngine.cached')}{' '}
            {fmt(stats.by_market?.CN?.count)}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * ExchangeDistributionCard: 按交易所分布卡片（Top 10）。
 * @param props - stats。
 * @returns 渲染的交易所分布卡片。
 */
export function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const exchangeEntries = stats.by_exchange
    ? Object.entries(stats.by_exchange)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(0, 10)
    : [];
  const maxCount = exchangeEntries.length > 0 ? Math.max(...exchangeEntries.map(([, c]) => c)) : 0;
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.byExchange')}</div>
      {exchangeEntries.map(([exchange, count]) => (
        <DistributionRow
          key={exchange}
          label={exchange || t('dataEngine.unknown')}
          count={count}
          maxCount={maxCount}
        />
      ))}
    </Card>
  );
}

/**
 * DecadeDistributionCard: 按年代分布柱状图卡片。
 * @param props - stats。
 * @returns 渲染的年代分布卡片。
 */
export function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_decade
    ? Object.entries(stats.by_decade).sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  return <DistributionBarCard titleKey="dataEngine.byDecade" entries={entries} />;
}

/**
 * YearCountDistributionCard: 按年数分布柱状图卡片。
 * @param props - stats。
 * @returns 渲染的年数分布卡片。
 */
export function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const entries = stats.by_year_count
    ? Object.entries(stats.by_year_count).sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  return <DistributionBarCard titleKey="dataEngine.byYearCount" entries={entries} />;
}

/** 柱状分布卡片：使用 recharts BarChart 渲染真正的柱状图 */
interface DistributionBarCardProps {
  titleKey: string;
  entries: [string, number][];
}

/**
 * DistributionBarCard: 通用柱状分布卡片。
 * @param props - titleKey/entries。
 * @returns 渲染的柱状图卡片。
 */
function DistributionBarCard({ titleKey, entries }: DistributionBarCardProps) {
  const { t } = useTranslation();
  const data = entries.map(([bucket, count]) => ({ bucket, count }));
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t(titleKey)}</div>
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
              angle={entries.length > 8 ? -35 : 0}
              textAnchor={entries.length > 8 ? 'end' : 'middle'}
              height={entries.length > 8 ? 50 : 30}
            />
            <YAxis hide />
            <Bar dataKey="count" fill={BAR_FILL} radius={[3, 3, 0, 0]} maxBarSize={60}>
              <LabelList
                dataKey="count"
                position="top"
                style={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'monospace' }}
                formatter={(v: number) => fmt(v)}
              />
              {data.map((entry) => (
                <Cell key={entry.bucket} fill={BAR_FILL} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
