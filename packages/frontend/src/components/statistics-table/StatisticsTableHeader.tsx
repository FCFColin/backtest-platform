/**
 * @file 统计表表头
 * @description 渲染指标列与各投资组合列，组合列头部展示颜色圆点与名称。
 */
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';

/** 统计表表头 Props */
export interface StatisticsTableHeaderProps {
  portfolios: PortfolioResult[];
  /** 指标列最小宽度（默认 320px，自定义指标表可用 160px） */
  minWidth?: string;
}

/** 统计表表头 */
export function StatisticsTableHeader({
  portfolios,
  minWidth = '320px',
}: StatisticsTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <tr className="stat-table-header-row">
      <th
        className="stat-table-header-cell stat-table-metric-cell text-[12px] text-left"
        style={{ minWidth }}
      >
        {t('common.metric')}
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="stat-table-header-cell stat-table-value-cell text-[12px] text-right"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </th>
      ))}
    </tr>
  );
}
