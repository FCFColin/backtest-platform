import { useTranslation } from 'react-i18next';
import type { Stats, UniverseStats } from './types.js';
import { fmt } from './utils.js';

export function MarketDistributionCard({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.byMarket')}
      </div>
      {stats.by_market &&
        Object.entries(stats.by_market).map(([market, data]) => (
          <div key={market} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>
                {market === 'US'
                  ? t('dataEngine.usStock')
                  : market === 'CN'
                    ? t('dataEngine.cnStock')
                    : market}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{fmt(data.count)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                fontSize: 12,
                color: 'var(--text-muted)',
                marginLeft: 8,
              }}
            >
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
        ))}
      {universe?.stats && (universe.stats.us != null || universe.stats.cn != null) && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border-soft)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('dataEngine.universeVsCache')}</div>
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
    </div>
  );
}

export function ExchangeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.byExchange')}
      </div>
      {stats.by_exchange &&
        Object.entries(stats.by_exchange)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([exchange, count]) => (
            <div
              key={exchange}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              <span style={{ color: 'var(--text-body)' }}>
                {exchange || t('dataEngine.unknown')}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{fmt(count)}</span>
            </div>
          ))}
    </div>
  );
}

export function DecadeDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const entries = stats.by_decade
    ? Object.entries(stats.by_decade).sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c)) : 0;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.byDecade')}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {entries.map(([decade, count]) => {
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div
              key={decade}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                {fmt(count)}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 60,
                  height: `${Math.max(heightPct, 2)}%`,
                  background: 'var(--brand-soft)',
                  border: '1px solid var(--brand)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {decade}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function YearCountDistributionCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const entries = stats.by_year_count
    ? Object.entries(stats.by_year_count).sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c)) : 0;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.byYearCount')}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
        {entries.map(([bucket, count]) => {
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div
              key={bucket}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
                {fmt(count)}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 50,
                  height: `${Math.max(heightPct, 2)}%`,
                  background: 'var(--support-soft)',
                  border: '1px solid var(--support)',
                  borderRadius: '4px 4px 0 0',
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {bucket}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
