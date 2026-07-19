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
 * 渲染一组统计指标数据行。
 *
 * 行为：
 * - 跳过所有投资组合在该指标上均无值的行
 * - 可见行按出现顺序交替条纹背景（仅计数可见行，保证条纹一致）
 */
export function MetricsRows({ rows, portfolios }: MetricsRowsProps) {
  const { t } = useTranslation();
  let rowIdx = 0;
  return (
    <>
      {rows.map((row) => {
        const hasAnyValue = portfolios.some(
          (p) => p.statistics[row.key] !== undefined && p.statistics[row.key] !== null,
        );
        if (!hasAnyValue) return null;
        const isAlt = rowIdx % 2 === 1;
        rowIdx++;
        return (
          <tr key={row.key} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
            <td
              className="text-[13px] py-2 px-3"
              style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
            >
              {t(row.label)}
            </td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key] as number | undefined;
              return (
                <td
                  key={p.name}
                  className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                  style={{
                    color: 'var(--text-strong)',
                    borderBottom: '1px solid var(--border-soft)',
                    whiteSpace: 'nowrap',
                  }}
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
