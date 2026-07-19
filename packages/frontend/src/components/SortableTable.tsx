/**
 * @file 可排序表格组件
 * @description 通用可排序表格，支持泛型数据类型，点击列头切换排序方向。
 * @example
 * interface Row { name: string; value: number }
 * const columns: Column<Row>[] = [
 *   { key: 'name', label: '名称' },
 *   { key: 'value', label: '数值', sortValue: (r) => r.value },
 * ]
 * <SortableTable columns={columns} data={rows} initialSortKey="value" initialSortDir="desc" />
 */
import { useState, type ReactNode } from 'react';

/** 列定义 */
export interface Column<T> {
  /** 列键名（对应数据字段名或自定义标识） */
  key: keyof T | string;
  /** 列头显示文本 */
  label: string;
  /** 自定义单元格渲染函数 */
  render?: (row: T) => ReactNode;
  /** 排序值提取函数（未提供时直接取 row[key]） */
  sortValue?: (row: T) => number | string;
}

/** SortableTable 组件 Props */
interface SortableTableProps<T> {
  /** 列定义数组 */
  columns: Column<T>[];
  /** 数据数组 */
  data: T[];
  /** 初始排序列键名 */
  initialSortKey?: string;
  /** 初始排序方向，默认 'desc' */
  initialSortDir?: 'asc' | 'desc';
}

/** 比较两行的排序值 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
function sortRows<T extends Record<string, any>>(
  a: T,
  b: T,
  sortKey: string | undefined,
  sortDir: 'asc' | 'desc',
  columns: Column<T>[],
): number {
  if (!sortKey) return 0;
  const col = columns.find((c) => String(c.key) === sortKey);
  if (!col) return 0;
  const av = col.sortValue ? col.sortValue(a) : a[sortKey];
  const bv = col.sortValue ? col.sortValue(b) : b[sortKey];
  if (av === bv) return 0;
  if (av < bv) return sortDir === 'asc' ? -1 : 1;
  return sortDir === 'asc' ? 1 : -1;
}

/**
 * 可排序表格组件
 *
 * - 点击列头切换排序：首次点击降序（desc），再次点击升序（asc）
 * - 当前排序列在列头显示 ▲（升序）或 ▼（降序）箭头
 * - 排序优先使用 column.sortValue，未提供时直接取 row[key]
 * - 使用泛型 T 支持任意数据类型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型约束需要 any 以兼容无索引签名的具体接口
export function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  initialSortKey,
  initialSortDir = 'desc',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);

  /** 点击列头排序：同列切换方向，新列默认降序 */
  const handleSort = (col: Column<T>) => {
    const colKey = String(col.key);
    if (sortKey === colKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(colKey);
      setSortDir('desc');
    }
  };

  /** 根据当前排序状态对数据进行排序 */
  const sortedData = [...data].sort((a, b) => sortRows(a, b, sortKey, sortDir, columns));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            {columns.map((col) => {
              const colKey = String(col.key);
              const isSorted = sortKey === colKey;
              return (
                <th
                  key={colKey}
                  onClick={() => handleSort(col)}
                  className="cursor-pointer text-[12px] font-semibold text-left py-2.5 px-3"
                  style={{
                    color: 'var(--text-muted)',
                    borderBottom: '2px solid var(--border-soft)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSorted && (
                      <span style={{ color: 'var(--brand)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr
              key={idx}
              style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
            >
              {columns.map((col) => {
                const colKey = String(col.key);
                return (
                  <td
                    key={colKey}
                    className="text-[13px] py-2 px-3"
                    style={{
                      color: 'var(--text-body)',
                      borderBottom: '1px solid var(--border-soft)',
                    }}
                  >
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
