import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TH_BORDER: CSSProperties = { borderBottom: '2px solid hsl(var(--border-subtle))' };
const TD_BORDER: CSSProperties = { borderBottom: '1px solid hsl(var(--border-subtle))' };
const TH_BASE =
  'text-caption text-fg-tertiary uppercase tracking-wide font-semibold py-2.5 px-3 whitespace-nowrap';
const TD_BASE = 'py-2 px-3 text-body text-fg';
const ZEBRA = 'bg-[color-mix(in_srgb,hsl(var(--elevated))_40%,hsl(var(--surface)))]';
const handleSortKey =
  (onSort: (key: string) => void, colKey: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSort(colKey);
    }
  };

export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('border border-border rounded-lg overflow-hidden', className)}>
      {children}
    </div>
  );
}

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

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  maxWidth?: number;
  rowKey?: (row: T, idx: number) => string;
  nowrap?: boolean;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  caption?: ReactNode;
  testIdOf?: (row: T) => string | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
function BaseTable<T extends Record<string, any>>({
  columns,
  data,
  maxWidth,
  rowKey,
  nowrap = true,
  sortKey,
  sortDir,
  onSort,
  caption,
  testIdOf,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-separate border-spacing-0 text-body"
        style={maxWidth ? { maxWidth } : undefined}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-elevated">
            {columns.map((col) => {
              const colKey = String(col.key);
              const isSorted = sortKey === colKey;
              return (
                <th
                  key={colKey}
                  scope="col"
                  aria-sort={
                    isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  onClick={onSort ? () => onSort(colKey) : undefined}
                  onKeyDown={onSort ? handleSortKey(onSort, colKey) : undefined}
                  tabIndex={onSort ? 0 : undefined}
                  className={cn(
                    TH_BASE,
                    onSort &&
                      'cursor-pointer text-left hover:text-fg transition-colors duration-150',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.sticky === 'left' && 'sticky left-0 z-10 bg-elevated',
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
            <tr
              key={rowKey ? rowKey(row, idx) : idx}
              className="hover:bg-hover/50 transition-colors"
            >
              {columns.map((col) => {
                const colKey = String(col.key);
                const isRight = col.align === 'right';
                const zebraBg = idx % 2 === 1 ? ZEBRA : '';
                return (
                  <td
                    key={colKey}
                    data-testid={col.testId ?? testIdOf?.(row)}
                    className={cn(
                      TD_BASE,
                      zebraBg,
                      nowrap && 'whitespace-nowrap',
                      isRight && 'text-right font-mono tabular-nums font-medium',
                      col.sticky === 'left' && cn('sticky left-0 z-10', zebraBg || 'bg-surface'),
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
  caption?: ReactNode;
  testIdOf?: (row: T) => string | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SimpleTable<T extends Record<string, any>>({
  columns,
  data,
  maxWidth,
  rowKey,
  caption,
  testIdOf,
}: SimpleTableProps<T>) {
  return (
    <BaseTable
      columns={columns}
      data={data}
      maxWidth={maxWidth}
      rowKey={rowKey}
      caption={caption}
      testIdOf={testIdOf}
    />
  );
}
interface SortableTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
  rowKey?: (row: T, idx: number) => string;
  caption?: ReactNode;
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
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // 空值恒排末尾，与升/降序无关
  if (bv == null) return -1;
  if (av === bv) return 0;
  return sortDir === 'asc' ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  initialSortKey,
  initialSortDir = 'desc',
  rowKey,
  caption,
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
      rowKey={rowKey}
      caption={caption}
    />
  );
}
