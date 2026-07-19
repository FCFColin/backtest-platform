/**
 * @file useListState Hook
 * @description 通用列表 CRUD 状态管理 hook，统一替换 asset/ticker 列表的 add/remove/update 重复逻辑
 * @example
 * // 对象列表（asset 列表）
 * const { items, setItems, addItem, removeItem, updateItem } = useListState(
 *   [{ ticker: 'VTI', weight: 60 }],
 *   () => ({ ticker: '', weight: 0 }),
 * );
 * updateItem(0, (prev) => ({ ...prev, ticker: 'SPY' }));
 *
 * // 原始类型列表（ticker 列表）
 * const { items, updateItem } = useListState<string>(['SPY'], () => '');
 * updateItem(0, () => 'TLT');
 */
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/** useListState 返回值结构 */
interface UseListStateResult<T> {
  /** 当前列表项数组 */
  items: T[];
  /** 直接设置列表（透传 useState 的 dispatch，用于批量替换等场景） */
  setItems: Dispatch<SetStateAction<T[]>>;
  /** 在列表末尾追加一项由 makeDefault 返回的默认值 */
  addItem: () => void;
  /** 按索引移除一项；若剩余长度不大于 minLength 则不执行（保持列表不被清空） */
  removeItem: (index: number) => void;
  /** 按索引就地更新一项，updater 接收当前项并返回新值 */
  updateItem: (index: number, updater: (prev: T) => T) => void;
}

/**
 * 通用列表 CRUD 状态管理 hook
 *
 * - `addItem` 在末尾追加 `makeDefault()` 返回的默认值
 * - `removeItem` 仅在 `prev.length > minLength` 时执行移除，避免列表被清空；
 *   `minLength = 0` 表示允许清空（无下限保护）
 * - `updateItem` 使用函数式更新以避免闭包陈旧值；调用方通过 updater 自行决定如何更新
 * （对象列表用 `prev => ({ ...prev, field: val })`，原始类型列表用 `() => val`）
 *
 * @param initial - 初始列表（仅首次渲染使用）
 * @param makeDefault - 创建新项的工厂函数
 * @param minLength - 列表最小长度，默认 1（用于阻止移除最后一项）
 * @returns 包含 items / setItems / addItem / removeItem / updateItem 的状态对象
 */
export function useListState<T>(
  initial: T[],
  makeDefault: () => T,
  minLength = 1,
): UseListStateResult<T> {
  const [items, setItems] = useState<T[]>(() => initial);

  const addItem = () => setItems((prev) => [...prev, makeDefault()]);
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length > minLength ? prev.filter((_, i) => i !== index) : prev));
  const updateItem = (index: number, updater: (prev: T) => T) =>
    setItems((prev) => prev.map((item, i) => (i === index ? updater(item) : item)));

  return { items, setItems, addItem, removeItem, updateItem };
}
