import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
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

// canvas 渲染器无法解析 CSS 变量，渲染前把 var(--x)/hsl(var(--x)) 深度解析为具体色值
const VAR_PATTERN = /(hsl\()?var\((--[\w-]+)\)(\))?/g;
function resolveVarColor(input: string): string {
  return input.replace(VAR_PATTERN, (full, hslOpen: string | undefined, name: string) => {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return resolved ? (hslOpen ? `hsl(${resolved})` : resolved) : full;
  });
}
function resolveTheme(option: EChartsOption): EChartsOption {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return resolveVarColor(node);
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
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
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
  }, [themeTick]);
  useEffect(() => {
    chartRef.current?.setOption(resolveTheme(option), { notMerge: true });
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
