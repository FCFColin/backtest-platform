/** @file DataEngine SEO / presets card */
import { useTranslation } from 'react-i18next';
import { fmt } from './utils.js';
import type { UniverseStats } from './types.js';

export function UniverseInfo({ universe }: { universe: UniverseStats }) {
  const { t } = useTranslation();
  return (
    <div
      className="bt-seo-card card"
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
