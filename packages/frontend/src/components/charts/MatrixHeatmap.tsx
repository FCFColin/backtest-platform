/**
 * @file 矩阵热力图通用组件
 * @description 推广自 CorrelationHeatmapChart.CorrelationMatrix 与 PCAPage.LoadingMatrix 的
 *              重复矩阵渲染逻辑：行/列标签 + 单元格背景色 + 文字色 + Tooltip。
 *              调用方负责外壳（ChartCard 或 chart-card div），本组件只渲染表格本体。
 */
interface MatrixHeatmapProps {
  /** 行标签（左侧一列） */
  rowLabels: string[];
  /** 列标签（顶部一行） */
  columnLabels: string[];
  /** 矩阵数据：matrix[i][j] 对应 rowLabels[i] × columnLabels[j] */
  matrix: number[][];
  /** 单元格背景色函数 */
  getBackgroundColor: (value: number) => string;
  /** 单元格文字色函数 */
  getTextColor: (value: number) => string;
  /** 单元格显示值格式化 */
  formatValue: (value: number) => string;
  /** Tooltip 标题格式化；未传则使用 `${rowLabel} vs ${colLabel}: ${value.toFixed(2)}` */
  formatTitle?: (value: number, rowLabel: string, colLabel: string) => string;
  /** 单元格最小宽度 px，默认 48 */
  minCellWidth?: number;
  /** 单元格最小高度 px，默认 36 */
  minCellHeight?: number;
  /** 单元格基准宽度（按列数缩放），默认 600 */
  baseCellWidth?: number;
  /** 单元格基准高度（按行数缩放），默认 400 */
  baseCellHeight?: number;
}

/**
 * 矩阵热力图
 *
 * 渲染带行/列标签的方阵表格，每个单元格根据值映射背景色与文字色。
 * 复用于相关性矩阵（CorrelationHeatmapChart）与 PCA 载荷矩阵（PCAPage）。
 */
export function MatrixHeatmap({
  rowLabels,
  columnLabels,
  matrix,
  getBackgroundColor,
  getTextColor,
  formatValue,
  formatTitle,
  minCellWidth = 48,
  minCellHeight = 36,
  baseCellWidth = 600,
  baseCellHeight = 400,
}: MatrixHeatmapProps) {
  const cellWidth = Math.max(minCellWidth, baseCellWidth / columnLabels.length);
  const cellHeight = Math.max(minCellHeight, baseCellHeight / rowLabels.length);
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-[11px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            />
            {columnLabels.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-[11px] font-medium text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <td
                className="px-3 py-2 text-[12px] font-medium"
                style={{ color: 'var(--text-body)' }}
              >
                {rowLabel}
              </td>
              {columnLabels.map((colLabel, j) => {
                const value = matrix[i]?.[j] ?? 0;
                const titleText = formatTitle
                  ? formatTitle(value, rowLabel, colLabel)
                  : `${rowLabel} vs ${colLabel}: ${value.toFixed(2)}`;
                return (
                  <td
                    key={colLabel}
                    className="text-[12px] text-center cursor-default"
                    style={{
                      backgroundColor: getBackgroundColor(value),
                      color: getTextColor(value),
                      width: `${cellWidth}px`,
                      height: `${cellHeight}px`,
                    }}
                    title={titleText}
                  >
                    {formatValue(value)}
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
