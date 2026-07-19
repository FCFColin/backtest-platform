import { useTranslation } from 'react-i18next';
import { CheckCircle, BarChart3 } from 'lucide-react';
import type { Stats, UniverseStats } from './types.js';
import { fmt, pct } from './utils.js';
import { QualityItem } from './dataEngineUI.js';

export function SampleTickersCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const categoryLabels: Record<string, string> = {
    us_stock: t('dataEngine.usStockCategory'),
    us_etf: t('dataEngine.usEtfCategory'),
    cn_stock: t('dataEngine.cnStockCategory'),
    cn_etf: t('dataEngine.cnEtfCategory'),
    index: t('dataEngine.indexCategory'),
  };
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.sampleTickers')}
      </div>
      {stats.sample_tickers &&
        Object.entries(stats.sample_tickers).map(
          ([category, items]) =>
            items.length > 0 && (
              <div key={category} style={{ marginBottom: 12 }}>
                <div
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)', marginBottom: 4 }}
                >
                  {categoryLabels[category] || category}
                </div>
                {items.map((tk) => (
                  <div
                    key={tk.ticker}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: 'var(--text-body)',
                      padding: '2px 0',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{tk.ticker}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}
                      {t('common.days')})
                    </span>
                  </div>
                ))}
              </div>
            ),
        )}
    </div>
  );
}

export function RecentUpdatesCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.recentUpdates')}
      </div>
      {stats.recent_updates?.slice(0, 15).map((upd) => (
        <div
          key={upd.ticker}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '3px 0',
            borderBottom: '1px dashed var(--border-soft)',
          }}
        >
          <span style={{ fontWeight: 500, color: 'var(--text-body)' }}>{upd.ticker}</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {upd.updated.replace('T', ' ').slice(0, 19)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DataQualityCard({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const totalCached = stats.total_cached || 0;
  const totalUniverse = universe?.total || totalCached;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.dataQuality')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <QualityItem
          icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />}
          label={t('dataEngine.adjClosePrice')}
          value={pct(stats.data_quality.with_adj_close || 0, totalUniverse)}
        />
        <QualityItem
          icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />}
          label={t('dataEngine.dividendData')}
          value={pct(stats.data_quality.with_dividends || 0, totalCached)}
        />
        <QualityItem
          icon={<CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />}
          label={t('dataEngine.withSplits')}
          value={pct(stats.data_quality.with_splits || 0, totalCached)}
        />
        <QualityItem
          icon={<BarChart3 className="w-4 h-4" style={{ color: 'var(--brand)' }} />}
          label={t('dataEngine.medianDataPoints')}
          value={fmt(stats.coverage.median_data_points || 0)}
        />
      </div>
    </div>
  );
}
