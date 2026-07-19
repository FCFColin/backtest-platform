import { useTranslation } from 'react-i18next';
import { Database, BarChart3, Clock, HardDrive } from 'lucide-react';
import type { Stats, UniverseStats } from './types.js';
import { fmt, formatStorageMb, historySpanYears } from './utils.js';
import { StatCard, ProgressBar } from './dataEngineUI.js';

export function DataEngineOverviewCards({
  stats,
  universe,
}: {
  stats: Stats;
  universe: UniverseStats | null;
}) {
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  const earliestDate = stats.date_ranges.earliest;
  const latestDate = stats.date_ranges.latest;
  const historyYears = historySpanYears(earliestDate, latestDate);
  const timeRangeSub =
    historyYears != null && earliestDate
      ? t('dataEngine.deepHistoryHighlight', {
          year: earliestDate.slice(0, 4),
          years: historyYears,
        })
      : `${t('dataEngine.to')} ${latestDate || '—'}`;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        margin: '8px 0',
      }}
    >
      <StatCard
        icon={<Database className="w-5 h-5" />}
        label={t('dataEngine.universeLabel')}
        value={fmt(totalUniverse)}
        sub={`${t('dataEngine.cached')} ${fmt(totalCached)} (${coverageBase > 0 ? ((totalCached / coverageBase) * 100).toFixed(1) : 0}%)`}
      />
      <StatCard
        icon={<BarChart3 className="w-5 h-5" />}
        label={t('dataEngine.totalDataPoints')}
        value={fmt(stats.data_quality.total_data_points || 0)}
        sub={`${t('dataEngine.avgPointsPerTicker')} ${fmt(stats.coverage.avg_data_points || 0)}`}
      />
      <StatCard
        icon={<Clock className="w-5 h-5" />}
        label={t('dataEngine.timeRange')}
        value={earliestDate || '—'}
        sub={timeRangeSub}
      />
      <StatCard
        icon={<HardDrive className="w-5 h-5" />}
        label={t('dataEngine.diskUsage')}
        value={formatStorageMb(stats.data_quality.total_size_mb || 0)}
        sub={t('dataEngine.dbStorageSub')}
      />
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
  const { t } = useTranslation();
  const totalUniverse = universe?.total || stats.total_cached || 0;
  const totalCached = stats.total_cached || 0;
  const coverageBase = totalUniverse > 0 ? totalUniverse : totalCached;
  return (
    <div className="bt-main-card card" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('dataEngine.dataCoverage')}
      </div>
      <ProgressBar
        label={t('dataEngine.totalCoverage')}
        current={totalCached}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.fiveYearsPlus')}
        current={stats.coverage.tickers_with_5y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.tenYearsPlus')}
        current={stats.coverage.tickers_with_10y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.twentyYearsPlus')}
        current={stats.coverage.tickers_with_20y_plus || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.adjCloseData')}
        current={stats.data_quality.with_adj_close || 0}
        total={coverageBase}
      />
      <ProgressBar
        label={t('dataEngine.dividendData')}
        current={stats.data_quality.with_dividends || 0}
        total={coverageBase}
      />
    </div>
  );
}
