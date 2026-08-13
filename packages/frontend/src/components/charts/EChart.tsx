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

// canvas 渲染器无法解析 CSS 变量，渲染前把 var(--x) 深度解析为具体色值；
// 别名 token（如 --text-muted 已是 hsl(...)）不可再包一层 hsl()
const VAR_PATTERN = /var\((--[\w-]+)\)/g;
const COLOR_FN = /^(?:hsl|rgb|rgba|hwb|lab|lch|oklch|color)\b/i;
function resolveToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return '';
  if (raw.includes('var(')) return resolveVarColor(raw);
  return COLOR_FN.test(raw) ? raw : `hsl(${raw})`;
}
function resolveVarColor(input: string): string {
  return input.replace(VAR_PATTERN, (full, name: string) => resolveToken(name) || full);
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
  }, []);
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
