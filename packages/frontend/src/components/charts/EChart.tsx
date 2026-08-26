import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { resolveVarColorToken } from '@/lib/cssVarResolver.js';
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  AxisPointerComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);
const COLOR_FN = /^(?:hsl|rgb|rgba|hwb|lab|lch|oklch|color)\b/i;
const CHANNEL_RE = /^\d+\s+[\d.]+%?\s+[\d.]+%?$/;
const tokenCache = new Map<string, string>();
function resolveToken(name: string): string {
  const cached = tokenCache.get(name);
  if (cached !== undefined) return cached;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = raw
    ? raw.includes('var(')
      ? resolveVarColorToken(raw, resolveToken)
      : COLOR_FN.test(raw) || !CHANNEL_RE.test(raw)
        ? raw
        : `hsl(${raw})`
    : '';
  tokenCache.set(name, value);
  return value;
}
function resolveVarColor(input: string): string {
  return resolveVarColorToken(input, resolveToken);
}
function resolveTheme(option: EChartsOption): EChartsOption {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return node.includes('var(') ? resolveVarColor(node) : node;
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  return walk(option) as EChartsOption;
}
interface EChartProps {
  option: EChartsOption;
  height: number | string;
  className?: string;
  ariaLabel?: string;
  onClick?: (params: { dataIndex?: number; seriesIndex?: number }) => void;
}
export default function EChart({ option, height, className, ariaLabel, onClick }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => {
      tokenCache.clear();
      setThemeTick((t) => t + 1);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.on('click', (params) => onClickRef.current?.(params));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(resolveTheme(option), { notMerge: true });
    // hidden→visible 时容器从 0 高度恢复，ResizeObserver 不触发，需显式重绘
    requestAnimationFrame(() => chart.resize());
  }, [option, themeTick]);
  return (
    <div
      ref={ref}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      className={className}
      style={{ height, width: '100%' }}
    />
  );
}
