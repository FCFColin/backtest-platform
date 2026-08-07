import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TH_BORDER: CSSProperties = { borderBottom: '2px solid hsl(var(--border-subtle))' };
const TD_BORDER: CSSProperties = { borderBottom: '1px solid hsl(var(--border-subtle))' };
const TH_BASE =
  'text-caption text-fg-tertiary uppercase tracking-wide font-semibold py-2.5 px-3 whitespace-nowrap';
const TD_BASE = 'py-2 px-3 text-body text-fg';
const rowClass = (idx: number) => cn(idx % 2 === 1 && 'bg-elevated/40');

export interface TableColumn<T> {
  key: keyof T | string;
  label: ReactNode;
  align?: 'left' | 'right';
  render?: (row: T, rowIdx: number) => ReactNode;
  sortValue?: (row: T) => number | string;
  style?: CSSProperties;
  sticky?: 'left';
  testId?: string;
}
export type SimpleTableColumn<T> = TableColumn<T>;
export type Column<T> = TableColumn<T>;

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  maxWidth?: number;
  rowKey?: (row: T, idx: number) => string;
  nowrap?: boolean;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function BaseTable<T extends Record<string, any>>({
  columns,
  data,
  maxWidth,
  rowKey,
  nowrap = true,
  sortKey,
  sortDir,
  onSort,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-body"
        style={maxWidth ? { maxWidth } : undefined}
      >
        <thead>
          <tr className="bg-elevated">
            {columns.map((col) => {
              const colKey = String(col.key);
              const isSorted = sortKey === colKey;
              return (
                <th
                  key={colKey}
                  onClick={onSort ? () => onSort(colKey) : undefined}
                  className={cn(
                    TH_BASE,
                    onSort &&
                      'cursor-pointer text-left hover:text-fg transition-colors duration-150',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.sticky === 'left' && 'sticky left-0 z-10',
                  )}
                  style={TH_BORDER}
                >
                  {onSort ? (
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {isSorted &&
                        (sortDir === 'asc' ? (
                          <ChevronUp className="size-3 text-brand" />
                        ) : (
                          <ChevronDown className="size-3 text-brand" />
                        ))}
                    </span>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={rowKey ? rowKey(row, idx) : idx} className={rowClass(idx)}>
              {columns.map((col) => {
                const colKey = String(col.key);
                const isRight = col.align === 'right';
                return (
                  <td
                    key={colKey}
                    data-testid={col.testId}
                    className={cn(
                      TD_BASE,
                      nowrap && 'whitespace-nowrap',
                      isRight && 'text-right font-mono tabular-nums font-medium',
                      col.sticky === 'left' && 'sticky left-0 z-10 bg-surface',
                    )}
                    style={{ ...TD_BORDER, ...col.style }}
                  >
                    {col.render ? col.render(row, idx) : String(row[colKey] ?? '')}
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
interface SimpleTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  maxWidth?: number;
  rowKey?: (row: T, idx: number) => string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SimpleTable<T extends Record<string, any>>({
  columns,
  data,
  maxWidth,
  rowKey,
}: SimpleTableProps<T>) {
  return <BaseTable columns={columns} data={data} maxWidth={maxWidth} rowKey={rowKey} />;
}
interface SortableTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
function sortRows<T extends Record<string, any>>(
  a: T,
  b: T,
  sortKey: string | undefined,
  sortDir: 'asc' | 'desc',
  columns: TableColumn<T>[],
): number {
  if (!sortKey) return 0;
  const col = columns.find((c) => String(c.key) === sortKey);
  if (!col) return 0;
  const av = col.sortValue ? col.sortValue(a) : a[sortKey];
  const bv = col.sortValue ? col.sortValue(b) : b[sortKey];
  if (av === bv) return 0;
  return sortDir === 'asc' ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  initialSortKey,
  initialSortDir = 'desc',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const handleSort = (colKey: string) => {
    if (sortKey === colKey) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(colKey);
      setSortDir('desc');
    }
  };
  const sortedData = useMemo(
    () => [...data].sort((a, b) => sortRows(a, b, sortKey, sortDir, columns)),
    [data, sortKey, sortDir, columns],
  );
  return (
    <BaseTable
      columns={columns}
      data={sortedData}
      nowrap={false}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={handleSort}
    />
  );
}
