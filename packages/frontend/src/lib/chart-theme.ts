import type { CSSProperties, ReactNode } from 'react';
import { CHART_COLORS } from '@backtest/shared';
import { formatCurrency } from '@/utils/format.js';
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'hsl(var(--chart-tooltip-bg) / 0.95)',
  border: '1px solid hsl(var(--border-strong))',
  borderRadius: '8px',
  padding: '12px',
  color: 'hsl(var(--fg))',
  boxShadow: 'var(--tooltip-shadow)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
} as const;
export const CHART_MARGIN = { top: 20, right: 40, bottom: 20, left: 80 } as const;
export const CHART_GRID_PROPS = {
  strokeWidth: 1,
  strokeDasharray: '3 3',
  vertical: true,
  horizontal: true,
} as const;
export const AXIS_TICK_STYLE = {
  fill: 'hsl(var(--fg-tertiary))',
  fontSize: 11,
  fontFamily: 'Geist Mono Variable',
} as const;
export const CHART_LINE_STYLE = {
  strokeWidth: 2.5,
  dot: false,
  activeDot: { r: 4, strokeWidth: 2 },
  isAnimationActive: false,
} as const;
export const LEGEND_WRAPPER_STYLE = { fontSize: '12px', color: 'hsl(var(--fg-tertiary))' } as const;
export const PORTFOLIO_COLORS = CHART_COLORS;
export function getPortfolioColor(index: number): string {
  return PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
}
export const DATE_TICK_FORMATTER = (value: string): string => value.slice(0, 7);
export const YEAR_ONLY_TICK_FORMATTER = (value: string | number): string =>
  String(value).slice(0, 4);
export function SMART_DATE_INTERVAL(totalMonths: number): number {
  if (totalMonths <= 12) return 1;
  if (totalMonths <= 60) return 6;
  if (totalMonths <= 120) return 12;
  if (totalMonths <= 240) return 24;
  return 60;
}
export const currencyFormatter = (value: number, currency = 'USD', digits = 0) =>
  formatCurrency(value, currency, digits);
const CORR_COLORS = {
  strongPositive: 'hsl(var(--corr-pos-1))',
  moderatePositive: 'hsl(var(--corr-pos-2))',
  weakPositive: 'hsl(var(--corr-pos-3))',
  faintPositive: 'hsl(var(--corr-pos-4))',
  neutral: 'hsl(var(--surface))',
  faintNegative: 'hsl(var(--corr-neg-4))',
  weakNegative: 'hsl(var(--corr-neg-3))',
  moderateNegative: 'hsl(var(--corr-neg-2))',
  strongNegative: 'hsl(var(--corr-neg-1))',
} as const;
const POS_CORR_THRESHOLDS = [0.8, 0.6, 0.4, 0.2] as const;
const POS_CORR_COLORS = [
  CORR_COLORS.strongPositive,
  CORR_COLORS.moderatePositive,
  CORR_COLORS.weakPositive,
  CORR_COLORS.faintPositive,
  CORR_COLORS.neutral,
] as const;
const NEG_CORR_THRESHOLDS = [-0.8, -0.6, -0.4, -0.2] as const;
const NEG_CORR_COLORS = [
  CORR_COLORS.strongNegative,
  CORR_COLORS.moderateNegative,
  CORR_COLORS.weakNegative,
  CORR_COLORS.faintNegative,
  CORR_COLORS.neutral,
] as const;
export function getCorrelationColor(val: number): string {
  if (val >= 0) {
    const idx = POS_CORR_THRESHOLDS.findIndex((t) => val >= t);
    return POS_CORR_COLORS[idx === -1 ? POS_CORR_COLORS.length - 1 : idx];
  }
  const idx = NEG_CORR_THRESHOLDS.findIndex((t) => val <= t);
  return NEG_CORR_COLORS[idx === -1 ? NEG_CORR_COLORS.length - 1 : idx];
}
export type TooltipValueFormatter = (value: number, name: string) => [string, string] | string;
export function wrapTooltipFormatter(
  userFormatter: TooltipValueFormatter | undefined,
):
  | ((
      value: unknown,
      name: unknown,
      _item?: unknown,
      _index?: number,
      _payload?: unknown,
    ) => [ReactNode, ReactNode])
  | undefined {
  if (!userFormatter) return undefined;
  return (
    value: unknown,
    name: unknown,
    _item?: unknown,
    _index?: number,
    _payload?: unknown,
  ): [ReactNode, ReactNode] => {
    try {
      const result = userFormatter(value as number, name as string);
      if (Array.isArray(result)) {
        const [formattedVal, formattedName] = result;
        return [formattedVal as ReactNode, (formattedName || name) as ReactNode];
      }
      return [result as ReactNode, name as ReactNode];
    } catch {
      return [String(value ?? ''), name as ReactNode];
    }
  };
}
export function getHeatColor(val: number | null): string {
  if (val === null) return CORR_COLORS.neutral;
  if (val > 5) return CORR_COLORS.strongPositive;
  if (val > 2) return CORR_COLORS.moderatePositive;
  if (val > 0) return CORR_COLORS.weakPositive;
  if (val > -1) return CORR_COLORS.faintNegative;
  if (val > -2) return CORR_COLORS.weakNegative;
  if (val > -5) return CORR_COLORS.moderateNegative;
  return CORR_COLORS.strongNegative;
}
export interface ThresholdBand<T = string> {
  threshold: number;
  value: T;
}
export function pickByThreshold<T>(
  value: number,
  bands: ReadonlyArray<ThresholdBand<T>>,
  defaultValue: T,
): T {
  for (const band of bands) {
    const matches = band.threshold >= 0 ? value >= band.threshold : value > band.threshold;
    if (matches) return band.value;
  }
  return defaultValue;
}
export function pickByAbsThreshold<T>(
  value: number,
  threshold: number,
  highValue: T,
  lowValue: T,
): T {
  return Math.abs(value) > threshold ? highValue : lowValue;
}
interface InterpolateHslOptions {
  hueStart?: number;
  hueEnd?: number;
  saturation?: number;
  lightness?: number;
  equalDefault?: string;
}
export function interpolateHsl(
  value: number,
  min: number,
  max: number,
  options: InterpolateHslOptions = {},
): string {
  const { hueStart = 0, hueEnd = 120, saturation = 70, lightness = 45, equalDefault } = options;
  if (min === max) {
    return equalDefault ?? `hsl(${(hueStart + hueEnd) / 2}, ${saturation}%, ${lightness}%)`;
  }
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = hueStart + normalized * (hueEnd - hueStart);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
