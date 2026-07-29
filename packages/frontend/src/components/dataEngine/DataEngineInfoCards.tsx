import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import type { Stats } from './utils.js';
import { fmt } from './utils.js';

export { RecentUpdatesCard } from './RecentUpdatesCard.js';

/**
 * SampleTickersCard: 各类别样本标的卡片。
 * @param props - stats。
 * @returns 渲染的样本标的卡片。
 */
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
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.sampleTickers')}</div>
      {stats.sample_tickers &&
        Object.entries(stats.sample_tickers).map(
          ([category, items]) =>
            items.length > 0 && (
              <div key={category} className="mb-3">
                <div className="mb-1 text-caption font-semibold text-brand">
                  {categoryLabels[category] || category}
                </div>
                {items.map((tk) => (
                  <div
                    key={tk.ticker}
                    className="flex justify-between py-0.5 text-caption text-fg-secondary"
                  >
                    <span className="font-medium">{tk.ticker}</span>
                    <span className="text-fg-tertiary">
                      {tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}
                      {t('common.days')})
                    </span>
                  </div>
                ))}
              </div>
            ),
        )}
    </Card>
  );
}
