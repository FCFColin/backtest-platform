interface MatrixHeatmapProps {
  rowLabels: string[];
  columnLabels: string[];
  matrix: number[][];
  getBackgroundColor: (value: number) => string;
  getTextColor: (value: number) => string;
  formatValue: (value: number) => string;
  formatTitle?: (value: number, rowLabel: string, colLabel: string) => string;
  minCellWidth?: number;
  minCellHeight?: number;
  baseCellWidth?: number;
  baseCellHeight?: number;
}
export function MatrixHeatmap({ rowLabels, columnLabels, matrix, getBackgroundColor, getTextColor, formatValue, formatTitle, minCellWidth = 48, minCellHeight = 36, baseCellWidth = 600, baseCellHeight = 400 }: MatrixHeatmapProps) {
  const cellWidth = Math.max(minCellWidth, baseCellWidth / columnLabels.length);
  const cellHeight = Math.max(minCellHeight, baseCellHeight / rowLabels.length);
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-label-tiny font-medium" style={{ color: 'var(--text-muted)' }} />
            {columnLabels.map((col) => (
              <th key={col} className="px-3 py-2 text-label-tiny font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <td className="px-3 py-2 text-caption font-medium" style={{ color: 'var(--text-body)' }}>
                {rowLabel}
              </td>
              {columnLabels.map((colLabel, j) => {
                const value = matrix[i]?.[j] ?? 0;
                const titleText = formatTitle ? formatTitle(value, rowLabel, colLabel) : `${rowLabel} vs ${colLabel}: ${value.toFixed(2)}`;
                return (
                  <td
                    key={colLabel}
                    className="text-caption text-center cursor-default"
                    style={{
                      backgroundColor: getBackgroundColor(value),
                      color: getTextColor(value),
                      width: `${cellWidth}px`,
                      height: `${cellHeight}px`
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
