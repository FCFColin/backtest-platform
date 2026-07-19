/**
 * @file 通用简单展示表格
 * @description 推广自 OptimizerResults:MetricsTable、RegressionChart:RegressionStatsTable、
 *              CorrelationHeatmapChart:BetaTable、DualSignalPage:StatsComparisonTable 的
 *              重复 thead/tbody/tr/td 样板。无排序能力，需要排序请使用 SortableTable。
 */
import type { CSSProperties, ReactNode } from 'react';

/** 列定义 */
export interface SimpleTableColumn<T> {
  /** 列键名（仅作 React key 用，不参与取值） */
  key: string;
  /** 列头内容（允许 ReactNode 以支持装饰元素，如彩色圆点） */
  label: ReactNode;
  /** 对齐方式，默认 'left'；'right' 自动应用 font-mono + var(--text-strong) */
  align?: 'left' | 'right';
  /** 单元格渲染函数（必填，避免与 row[key] 取值约定混淆） */
  render: (row: T, rowIdx: number) => ReactNode;
  /** 额外单元格样式 */
  style?: CSSProperties;
}

/** SimpleTable Props */
interface SimpleTableProps<T> {
  /** 列定义数组 */
  columns: SimpleTableColumn<T>[];
  /** 数据数组 */
  data: T[];
  /** 表格最大宽度（px），未传则无限制 */
  maxWidth?: number;
  /** 行 key 提取函数，默认使用行索引 */
  rowKey?: (row: T, idx: number) => string;
}

/**
 * 通用简单展示表格
 *
 * - 列头：var(--bg-subtle) 背景、12px font-semibold、底部 2px 实线
 * - 单元格：13px、底部 1px 实线、奇数行 var(--bg-subtle) 条纹
 * - 右对齐列：自动应用 font-mono + font-medium + var(--text-strong)
 * - 排序能力请使用 SortableTable；本组件专注于无交互的展示场景
 */
export function SimpleTable<T>({ columns, data, maxWidth, rowKey }: SimpleTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={maxWidth ? { maxWidth } : undefined}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-[12px] font-semibold py-2.5 px-3 ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
                style={{
                  color: 'var(--text-muted)',
                  borderBottom: '2px solid var(--border-soft)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={rowKey ? rowKey(row, idx) : idx}
              style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              {columns.map((col) => {
                const isRight = col.align === 'right';
                return (
                  <td
                    key={col.key}
                    className={`text-[13px] py-2 px-3 ${
                      isRight ? 'font-medium text-right font-mono' : ''
                    }`}
                    style={{
                      color: isRight ? 'var(--text-strong)' : 'var(--text-body)',
                      borderBottom: '1px solid var(--border-soft)',
                      whiteSpace: 'nowrap',
                      ...col.style,
                    }}
                  >
                    {col.render(row, idx)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
