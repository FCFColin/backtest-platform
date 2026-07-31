import { useState, useMemo, useCallback } from 'react';
export const SYNC_CHART_POINTS = 400;
export const DOWNSAMPLE_THRESHOLD = 10000;
export const DOWNSAMPLE_TARGET = 1000;
export const CHART_MAX_POINTS = 500;
export function useChartData<T>(data: T[], maxPoints: number = CHART_MAX_POINTS): T[] {
  return useMemo(() => (data.length > maxPoints ? downsample(data, maxPoints) : data), [data, maxPoints]);
}
export function downsample<T>(data: T[], maxPoints: number = 10000): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  return result;
}
export function useZoomRange<T>(data: T[], initialRange?: [number, number]) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(initialRange ? [initialRange[0], initialRange[1]] : null);
  const visibleData = useMemo(() => {
    if (!zoomRange) return data;
    return data.slice(zoomRange[0], zoomRange[1] + 1);
  }, [data, zoomRange]);
  const resetZoom = useCallback(() => setZoomRange(null), []);
  return { visibleData, zoomRange, setZoomRange, resetZoom };
}
