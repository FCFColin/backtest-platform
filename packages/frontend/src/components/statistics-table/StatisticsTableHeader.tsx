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
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{
          color: 'var(--text-muted)',
          borderBottom: '2px solid var(--border-soft)',
          minWidth,
        }}
      >
        {t('common.metric')}
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="text-[12px] font-semibold text-right py-2.5 px-3"
          style={{
            color: 'var(--text-muted)',
            borderBottom: '2px solid var(--border-soft)',
            whiteSpace: 'nowrap',
          }}
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
