/**
 * @file 统计指标行渲染
 * @description 渲染一组统计指标的数据行（不含分组标题行）。
 *   自动跳过所有投资组合均无值的指标行；可见行交替条纹背景。
 *   供 StatisticsGroupRows（分组模式）与 CustomMetricsTable（扁平模式）复用，
 *   消除两处重复的行渲染逻辑。
 */
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import type { StatRow } from './types.js';
import { formatValue } from './helpers.js';

/** 指标行渲染 Props */
export interface MetricsRowsProps {
  /** 要渲染的指标行定义列表 */
  rows: StatRow[];
  /** 投资组合列表 */
  portfolios: PortfolioResult[];
}

/**
 * 判断数值应该显示什么颜色：正值绿色，负值红色
 */
function getValueColorClass(val: number | undefined): string {
  if (val == null) return '';
  if (val > 0) return 'stat-value-positive';
  if (val < 0) return 'stat-value-negative';
  return '';
}

/**
 * 渲染一组统计指标数据行。
 *
 * 行为：
 * - 跳过所有投资组合在该指标上均无值的行
 * - 可见行按出现顺序交替条纹背景（仅计数可见行，保证条纹一致）
 */
export function MetricsRows({ rows, portfolios }: MetricsRowsProps) {
  const { t } = useTranslation();
  return (
    <>
      {rows.map((row) => {
        const hasAnyValue = portfolios.some((p) => p.statistics[row.key] != null);
        if (!hasAnyValue) return null;
        return (
          <tr key={row.key} className="stat-table-data-row">
            <td className="stat-table-metric-cell text-[13px]">{t(row.label)}</td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key] as number | undefined;
              const colorClass = getValueColorClass(val);
              return (
                <td
                  key={p.name}
                  className={`stat-table-value-cell stat-table-num text-[13px] ${colorClass}`}
                >
                  {formatValue(val, row.fmt)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
