import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
export interface SimpleTableColumn<T> {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right';
  /** 单元格渲染函数（必填，避免与 row[key] 取值约定混淆） */
  render: (row: T, rowIdx: number) => ReactNode;
  style?: CSSProperties;
}
interface SimpleTableProps<T> {
  columns: SimpleTableColumn<T>[];
  data: T[];
  maxWidth?: number;
  rowKey?: (row: T, idx: number) => string;
}
export function SimpleTable<T>({ columns, data, maxWidth, rowKey }: SimpleTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body" style={maxWidth ? { maxWidth } : undefined}>
        <thead>
          <tr className="bg-elevated">
            {columns.map((col) => (
              <th key={col.key} className={cn('text-caption text-fg-tertiary uppercase tracking-wide font-semibold py-2.5 px-3 whitespace-nowrap', col.align === 'right' ? 'text-right' : 'text-left')} style={{ borderBottom: '2px solid hsl(var(--border-subtle))' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={rowKey ? rowKey(row, idx) : idx} className={cn(idx % 2 === 1 && 'bg-elevated/40')}>
              {columns.map((col) => {
                const isRight = col.align === 'right';
                return (
                  <td
                    key={col.key}
                    className={cn('py-2 px-3 whitespace-nowrap text-body text-fg', isRight && 'text-right font-mono tabular-nums font-medium')}
                    style={{
                      borderBottom: '1px solid hsl(var(--border-subtle))',
                      ...col.style
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
