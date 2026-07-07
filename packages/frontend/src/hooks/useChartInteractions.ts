/**
 * @file 图表交互增强 Hook
 * @description 提供大数据集降采样与缩放范围管理，用于在数据传入图表前降低渲染压力并支持交互式缩放
 */
import { useState, useMemo, useCallback } from 'react';

/** 主曲线图表最大渲染点数 */
export const SYNC_CHART_POINTS = 400;
/** 大数据集（散点/相关性等）降采样阈值 */
export const DOWNSAMPLE_THRESHOLD = 10000;
/** 大数据集降采样目标点数 */
export const DOWNSAMPLE_TARGET = 1000;
/** 折线/面积图推荐最大渲染点数（分析页、回测页等通用） */
export const CHART_MAX_POINTS = 500;

/**
 * 图表数据降采样 Hook
 *
 * 自动对超过阈值的数组降采样，避免 Recharts 渲染大量 DOM 元素导致卡顿。
 * 所有展示时间序列折线/面积图的组件应统一使用此 Hook。
 *
 * @param data 原始数据
 * @param maxPoints 目标点数，默认 CHART_MAX_POINTS (500)
 * @returns 降采样后的数据（memoized，data 引用变化时重新计算）
 */
export function useChartData<T>(data: T[], maxPoints: number = CHART_MAX_POINTS): T[] {
  return useMemo(
    () => (data.length > maxPoints ? downsample(data, maxPoints) : data),
    [data, maxPoints],
  );
}

/**
 * 大数据集降采样
 *
 * 当数据量超过 maxPoints 时，按等距步长抽取样本点，并确保最后一个点被包含，
 * 以避免长序列折线图渲染卡顿。数据量未超阈值时原样返回。
 * @param data 原始数据数组
 * @param maxPoints 最大保留点数，默认 10000
 * @returns 降采样后的数据数组
 */
export function downsample<T>(data: T[], maxPoints: number = 10000): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  // 确保最后一个点被包含
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  return result;
}

/**
 * 图表缩放范围管理
 *
 * 维护一个 [startIndex, endIndex] 的缩放窗口，visibleData 为窗口内的数据切片。
 * 未设置缩放范围时返回完整数据。配合 recharts Brush 或外部控件使用。
 * @param data 完整数据数组
 * @param initialRange 初始缩放范围 [startIndex, endIndex]
 */
export function useZoomRange<T>(data: T[], initialRange?: [number, number]) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(
    initialRange ? [initialRange[0], initialRange[1]] : null,
  );

  const visibleData = useMemo(() => {
    if (!zoomRange) return data;
    return data.slice(zoomRange[0], zoomRange[1] + 1);
  }, [data, zoomRange]);

  const resetZoom = useCallback(() => setZoomRange(null), []);

  return { visibleData, zoomRange, setZoomRange, resetZoom };
}
