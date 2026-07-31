import { useMemo, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
export interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
}
interface SortableTableProps<T> {
  columns: Column<T>[];
  data: T[];
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
function sortRows<T extends Record<string, any>>(a: T, b: T, sortKey: string | undefined, sortDir: 'asc' | 'desc', columns: Column<T>[]): number {
  if (!sortKey) return 0;
  const col = columns.find((c) => String(c.key) === sortKey);
  if (!col) return 0;
  const av = col.sortValue ? col.sortValue(a) : a[sortKey];
  const bv = col.sortValue ? col.sortValue(b) : b[sortKey];
  if (av === bv) return 0;
  if (av < bv) return sortDir === 'asc' ? -1 : 1;
  return sortDir === 'asc' ? 1 : -1;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SortableTable<T extends Record<string, any>>({ columns, data, initialSortKey, initialSortDir = 'desc' }: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const handleSort = (col: Column<T>) => {
    const colKey = String(col.key);
    if (sortKey === colKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(colKey);
      setSortDir('desc');
    }
  };
  const sortedData = useMemo(() => [...data].sort((a, b) => sortRows(a, b, sortKey, sortDir, columns)), [data, sortKey, sortDir, columns]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="bg-elevated">
            {columns.map((col) => {
              const colKey = String(col.key);
              const isSorted = sortKey === colKey;
              return (
                <th key={colKey} onClick={() => handleSort(col)} className="cursor-pointer text-caption text-fg-tertiary uppercase tracking-wide font-semibold text-left py-2.5 px-3 whitespace-nowrap hover:text-fg transition-colors duration-150" style={{ borderBottom: '2px solid hsl(var(--border-subtle))' }}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSorted && (sortDir === 'asc' ? <ChevronUp className="size-3 text-brand" /> : <ChevronDown className="size-3 text-brand" />)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr key={idx} className={cn(idx % 2 === 1 && 'bg-elevated/40')}>
              {columns.map((col) => {
                const colKey = String(col.key);
                return (
                  <td key={colKey} className="py-2 px-3 text-body text-fg" style={{ borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                    {col.render ? col.render(row) : String(row[colKey] ?? '')}
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
