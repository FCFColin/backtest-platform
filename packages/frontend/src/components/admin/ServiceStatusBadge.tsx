/**
 * @file 服务健康状态徽章
 * @description Admin Dashboard / SystemMonitor 共享的服务状态徽章
 */
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

type ServiceStatus = 'healthy' | 'degraded' | 'down';

interface ServiceStatusBadgeProps {
  /** 服务健康状态 */
  status: ServiceStatus;
  /**
   * 视觉变体：
   * - pill（默认）：图标 + 文字胶囊，用于 SystemMonitor
   * - dot：仅图标圆点，用于 AdminDashboard
   */
  variant?: 'pill' | 'dot';
  /** 图标尺寸：sm=h-3 w-3（默认，配 pill），md=h-4 w-4（配 dot） */
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  ServiceStatus,
  { icon: typeof CheckCircle; color: string; bg: string; labelKey: string }
> = {
  healthy: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-50',
    labelKey: 'adminPage.monitor.statusHealthy',
  },
  degraded: {
    icon: AlertCircle,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50',
    labelKey: 'adminPage.monitor.statusDegraded',
  },
  down: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-50',
    labelKey: 'adminPage.dataManagement.statusInactive',
  },
};

/**
 * 服务健康状态徽章。
 * 颜色与图标映射统一自原 AdminDashboard / SystemMonitor 两处 statusConfig。
 */
export function ServiceStatusBadge({
  status,
  variant = 'pill',
  size = 'sm',
}: ServiceStatusBadgeProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  if (variant === 'dot') {
    return (
      <div className={`rounded-full p-1 ${config.bg}`}>
        <Icon className={`${iconSize} ${config.color}`} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${config.bg}`}>
      <Icon className={`${iconSize} ${config.color}`} />
      <span className={`text-xs font-medium ${config.color}`}>{t(config.labelKey)}</span>
    </div>
  );
}
