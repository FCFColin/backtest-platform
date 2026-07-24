/**
 * @file 计算器基础 UI 组件
 * @description 基于 shadcn Card / Field / Input / Collapsible 与 chart-theme 的计算器通用组件：
 *   Field（数字输入 + 后缀）、ResultRow（结果行）、InfoBox（公式提示）、
 *   CollapsibleCard（可折叠卡片）、TwoFundChart / SWRChart（基于 chart-theme）。
 */
import { useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field as FieldShell, FieldLabel } from '@/components/form/Field';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme';

// ============ Field ============

interface CalcFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前数值 */
  value: number;
  /** 数值变更回调 */
  onChange: (v: number) => void;
  /** 可选后缀（如 %、x、年） */
  suffix?: string;
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 步进，默认 0.1 */
  step?: number;
}

/**
 * 计算器数字输入字段：FieldLabel + Input(type=number) + 可选后缀。
 * @param props - 见 CalcFieldProps
 * @returns 渲染的字段
 */
export function Field({ label, value, onChange, suffix, min, max, step = 0.1 }: CalcFieldProps) {
  return (
    <FieldShell>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className={suffix ? 'pr-10' : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

// ============ ResultRow ============

/** 结果行语义色调 */
type ResultTone = 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'default';

const RESULT_TONE_CLASS: Record<ResultTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-fg-secondary',
  default: 'text-fg',
};

interface ResultRowProps {
  /** 行标签 */
  label: ReactNode;
  /** 行数值 */
  value: ReactNode;
  /** 语义色调，默认 default */
  tone?: ResultTone;
}

/**
 * 计算器结果行：标签左对齐，数值右对齐并使用等宽数字。
 * @param props - 见 ResultRowProps
 * @returns 渲染的结果行
 */
export function ResultRow({ label, value, tone = 'default' }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-label text-fg-tertiary">{label}</span>
      <span className={cn('font-mono tabular-nums text-label font-semibold', RESULT_TONE_CLASS[tone])}>
        {value}
      </span>
    </div>
  );
}

// ============ InfoBox ============

/**
 * 公式 / 说明提示框。
 * @param props - children 为提示内容
 * @returns 渲染的提示框
 */
export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2.5 rounded-md bg-input-bg p-3 text-caption leading-relaxed text-fg-tertiary">
      {children}
    </div>
  );
}

// ============ CollapsibleCard ============

interface CollapsibleCardProps {
  /** 标题图标（lucide 组件） */
  icon: ElementType;
  /** 卡片标题 */
  title: string;
  /** 是否默认展开，默认 false */
  defaultOpen?: boolean;
  /** 卡片内容 */
  children: ReactNode;
}

/**
 * 可折叠计算器卡片：Card + shadcn Collapsible，标题栏含图标与旋转 chevron。
 * @param props - 见 CollapsibleCardProps
 * @returns 渲染的可折叠卡片
 */
export function CollapsibleCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden bg-elevated">
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-center gap-2.5 p-4 text-left',
            'transition-colors duration-150 hover:bg-hover'
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
            <Icon className="size-4 text-brand" />
          </span>
          <h3 className="flex-1 text-h3 text-fg">{title}</h3>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-fg-tertiary transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 pt-0">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============ TwoFundChart ============

/**
 * 双基金有效前沿图（波动率 vs CAGR）。
 * @param props - data 为前沿采样点
 * @returns 渲染的折线图
 */
export function TwoFundChart({ data }: { data: Array<{ wA: number; cagr: number; vol: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="vol"
            type="number"
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            label={{
              value: t('calculators.base.volatility'),
              position: 'insideBottom',
              offset: -4,
              fontSize: 11,
              fill: 'var(--fg-tertiary)',
            }}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            label={{
              value: 'CAGR',
              angle: -90,
              position: 'insideLeft',
              offset: 8,
              fontSize: 11,
              fill: 'var(--fg-tertiary)',
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              `${v.toFixed(2)}%`,
              name === 'cagr' ? 'CAGR' : name,
            ]}
            labelFormatter={(l: number) =>
              t('calculators.base.volatilityWithValue', { value: `${l.toFixed(2)}%` })
            }
          />
          <Line
            type="monotone"
            dataKey="cagr"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ SWRChart ============

/**
 * SWR 组合存活比率图（年份 vs 资产比率）。
 * @param props - data 为逐年比率点
 * @returns 渲染的面积图
 */
export function SWRChart({ data }: { data: Array<{ year: number; ratio: number }> }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number) => [v.toFixed(3), t('calculators.base.assetRatio')]}
          />
          <Area
            type="monotone"
            dataKey="ratio"
            stroke={CHART_COLORS[2]}
            fill={CHART_COLORS[2]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
