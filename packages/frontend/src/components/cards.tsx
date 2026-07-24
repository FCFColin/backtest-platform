/**
 * @file 通用卡片展示组件
 * @description 承载账户/偏好等页面共享的 SectionTitle / PrefRow / StatCard 展示组件
 */
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
}

/**
 * 章节标题（图标 + 标题，brand 色调）。
 * @param props - 组件属性
 * @param props.icon - 标题前置图标节点
 * @param props.title - 标题文本
 * @returns 渲染的章节标题元素
 */
export function SectionTitle({ icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3.5 text-brand">
      {icon}
      <span className="text-h3 text-fg font-semibold">{title}</span>
    </div>
  );
}

interface PrefRowProps {
  icon: ReactNode;
  label: string;
  desc: string;
  children: ReactNode;
}

/**
 * 偏好设置行（图标 + 标签/描述 + 控件槽），以 shadcn Card 为容器。
 * @param props - 组件属性
 * @param props.icon - 行前置图标节点
 * @param props.label - 行标签文本
 * @param props.desc - 行描述文本
 * @param props.children - 行尾部控件槽
 * @returns 渲染的偏好设置行卡片
 */
export function PrefRow({ icon, label, desc, children }: PrefRowProps) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <div className="text-brand shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-body font-semibold text-fg">{label}</div>
        <div className="text-caption text-fg-tertiary">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </Card>
  );
}

/** StatCard 趋势方向 */
type StatTrend = 'up' | 'down' | 'flat';

interface StatCardProps {
  /** 指标标签（已翻译文案） */
  label: string;
  /** 指标主值 */
  value: ReactNode;
  /** 趋势方向：up 显示绿色上行箭头，down 显示红色下行箭头，flat 显示中性横线 */
  trend?: StatTrend;
  /** 趋势辅助文案（如 +12.4%） */
  trendValue?: string;
  /** 可选前置图标节点 */
  icon?: ReactNode;
  /** 自定义底部内容槽 */
  children?: ReactNode;
}

/**
 * 统计指标卡片：以 shadcn Card 为容器，展示标签 / 主值 / 趋势。
 * @param props - 见 StatCardProps
 * @returns 渲染的统计指标卡片
 */
export function StatCard({ label, value, trend, trendValue, icon, children }: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendClass =
    trend === 'up'
      ? 'text-pos'
      : trend === 'down'
        ? 'text-neg'
        : 'text-fg-tertiary';
  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5 text-caption text-fg-tertiary uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-display text-fg tabular-nums font-mono">{value}</div>
      {(trend || trendValue) && (
        <div className={cn('mt-1.5 flex items-center gap-1 text-label', trendClass)}>
          {trend && <TrendIcon className="size-3.5 shrink-0" />}
          {trendValue && <span>{trendValue}</span>}
        </div>
      )}
      {children}
    </Card>
  );
}
