/**
 * 通用虚拟列表组件（D3-007）。
 *
 * 使用 @tanstack/react-virtual 实现虚拟滚动，仅渲染可视区域内的元素，
 * 支持上万条数据的高性能渲染。适用于标的列表、回测历史等长列表场景。
 *
 * 企业理由：原生 .map() 渲染所有 DOM 节点，数据量大时（>100 条）导致
 * 首屏渲染慢、内存占用高、滚动卡顿。虚拟滚动只渲染可视区域 + overscan
 * 缓冲区的节点，DOM 节点数恒定为 O(visible + overscan)，与数据总量无关。
 */
import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * VirtualList 组件属性。
 *
 * @template T - 列表项数据类型
 */
interface VirtualListProps<T> {
  /** 列表数据数组 */
  items: T[];
  /** 渲染单个列表项的函数 */
  renderItem: (item: T, index: number) => ReactNode;
  /** 预估每项高度（px），用于虚拟滚动计算 */
  estimateSize?: number;
  /** 容器高度（px 或 CSS 字符串），默认 400 */
  height?: number | string;
  /** 容器额外 className */
  className?: string;
  /** overscan 缓冲区行数，默认 5 */
  overscan?: number;
}

/**
 * 通用虚拟列表组件。
 *
 * 仅渲染可视区域内的列表项，支持高效渲染大数据量列表。
 *
 * @param items - 列表数据
 * @param renderItem - 渲染函数
 * @param estimateSize - 预估每项高度（px），默认 40
 * @param height - 容器高度，默认 400
 * @param className - 容器额外 className
 * @param overscan - 缓冲区行数，默认 5
 * @template T - 列表项数据类型
 */
export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 40,
  height = 400,
  className,
  overscan = 5,
}: VirtualListProps<T>): ReactNode {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div
      ref={parentRef}
      style={{ height, overflow: 'auto', position: 'relative' }}
      className={className}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default VirtualList;
