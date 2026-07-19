/**
 * @file KPI 指标卡片
 * @description Admin 三页（Dashboard / DataManagement / SystemMonitor）共享的统计卡片
 */
import type { ReactNode } from 'react';

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
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
};

/**
 * KPI 指标卡片：左侧带色彩图标，右侧标题 + 主值 + 可选副标题。
 * 视觉与原 AdminDashboard / DataManagement / SystemMonitor 三处 StatCard 完全一致。
 */
export function KpiCard({ label, value, icon, color = 'blue', subtitle }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {icon && <div className={`rounded-lg p-2 ${COLOR_CLASSES[color]}`}>{icon}</div>}
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-800">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
