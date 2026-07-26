/**
 * @file KPI 指标卡片
 * @description Admin 三页（Dashboard / DataManagement / SystemMonitor）共享的统计卡片
 */
import type { ReactNode } from 'react';
import { Card, CardHeader, CardContent } from '../ui/card.js';

type KpiColor = 'blue' | 'green' | 'purple' | 'orange' | 'red';

interface KpiCardProps {
  /** 卡片标题（通常为 i18n key 翻译后的文案） */
  label: string;
  /** 主指标值 */
  value: ReactNode;
  /** 左侧图标节点 */
  icon?: ReactNode;
  /** 主题色，默认 blue */
  color?: KpiColor;
  /** 副标题（SystemMonitor 使用） */
  subtitle?: string;
}

const COLOR_CLASSES: Record<KpiColor, string> = {
  blue: 'bg-brand/10 text-brand',
  green: 'bg-success/10 text-success',
  purple: 'bg-brand/15 text-brand',
  orange: 'bg-warning/10 text-warning',
  red: 'bg-danger/10 text-danger',
};

/**
 * KPI 指标卡片：基于 shadcn Card，CardHeader 放图标与标签，CardContent 放主值与副标题。
 * 数值使用 text-display + tabular-nums + font-mono，标签使用 caption 级 tertiary 文案。
 */
export function KpiCard({ label, value, icon, color = 'blue', subtitle }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 p-4 pb-2">
        {icon && <div className={`rounded-lg p-2 ${COLOR_CLASSES[color]}`}>{icon}</div>}
        <p className="text-caption uppercase tracking-wide text-fg-tertiary">{label}</p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-display tabular-nums font-mono text-fg">{value}</p>
        {subtitle && <p className="mt-1 text-caption text-fg-tertiary">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
