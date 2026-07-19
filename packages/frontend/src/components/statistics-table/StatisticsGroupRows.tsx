/**
 * @file 统计表分组行
 * @description 渲染单个统计分组：分组标题行 + 该分组下所有有效指标的数据行。
 *   行渲染委托给 {@link MetricsRows}，本组件仅负责分组标题行。
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import type { StatGroup } from './types.js';
import { MetricsRows } from './MetricsRows.js';

/** 统计表分组行 Props */
export interface StatisticsGroupRowsProps {
  /** 当前要渲染的分组 */
  group: StatGroup;
  /** 投资组合列表 */
  portfolios: PortfolioResult[];
  /** 表格总列数（含指标名列），用于分组标题行 colSpan */
  colCount: number;
}

/** 统计表分组行 */
export function StatisticsGroupRows({ group, portfolios, colCount }: StatisticsGroupRowsProps) {
  const { t } = useTranslation();
  return (
    <Fragment key={group.title}>
      <tr style={{ backgroundColor: 'var(--bg-strong)' }}>
        <td
          colSpan={colCount}
          className="text-[12px] font-bold py-2 px-3"
          style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}
        >
          {t(group.title)}
        </td>
      </tr>
      <MetricsRows rows={group.rows} portfolios={portfolios} />
    </Fragment>
  );
}
