/**
 * @file 图表高级交互 Hook
 * @description P4-2: 区间选择器 + 对数坐标切换 + Y 轴联动 + 对比模式。
 *   所有图表可通过此 hook 共享交互状态。
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChartInteractionState {
  /** X 轴可见区间 [startIdx, endIdx] */
  visibleRange: [number, number];
  /** 是否对数坐标 */
  logScale: boolean;
  /** hover 高亮的日期索引 */
  hoverIndex: number | null;
  /** 是否对比模式 */
  compareMode: boolean;
}

export interface ChartInteractionActions {
  setVisibleRange: (range: [number, number]) => void;
  toggleLogScale: () => void;
  setHoverIndex: (idx: number | null) => void;
  toggleCompareMode: () => void;
  reset: () => void;
}

/**
 * 图表高级交互 Hook。
 * 管理区间选择、对数切换、hover 联动和对比模式。
 */
export function useChartInteractionsAdvanced(
  totalPoints: number,
): ChartInteractionState & ChartInteractionActions {
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, totalPoints - 1]);
  const [logScale, setLogScale] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const toggleLogScale = useCallback(() => setLogScale((v) => !v), []);
  const toggleCompareMode = useCallback(() => setCompareMode((v) => !v), []);
  const reset = useCallback(() => {
    setVisibleRange([0, totalPoints - 1]);
    setLogScale(false);
    setHoverIndex(null);
    setCompareMode(false);
  }, [totalPoints]);

  return {
    visibleRange,
    logScale,
    hoverIndex,
    compareMode,
    setVisibleRange,
    toggleLogScale,
    setHoverIndex,
    toggleCompareMode,
    reset,
  };
}

/**
 * 迷你图拖拽区间选择器 Hook。
 * 返回 ref 和事件处理器，用于绑定到迷你图 SVG 上。
 */
export function useRangeSelector(
  totalPoints: number,
  onRangeChange: (range: [number, number]) => void,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      dragStartRef.current = Math.floor(x * totalPoints);
      setDragging(true);
    },
    [totalPoints],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const endIdx = Math.floor(x * totalPoints);
      const start = Math.min(dragStartRef.current, endIdx);
      const end = Math.max(dragStartRef.current, endIdx);
      onRangeChange([Math.max(0, start), Math.min(totalPoints - 1, end)]);
    },
    [dragging, totalPoints, onRangeChange],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const handleGlobalUp = () => setDragging(false);
    document.addEventListener('mouseup', handleGlobalUp);
    return () => document.removeEventListener('mouseup', handleGlobalUp);
  }, [dragging]);

  return {
    svgRef,
    dragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
