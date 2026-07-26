/**
 * @file 服务健康状态徽章
 * @description Admin Dashboard / SystemMonitor 共享的服务状态徽章
 */
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Badge, type BadgeProps } from '../ui/badge.js';
import { cn } from '../../lib/utils.js';

type ServiceStatus = 'healthy' | 'degraded' | 'down';
type BadgeVariant = NonNullable<BadgeProps['variant']>;

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
  {
    icon: typeof CheckCircle;
    badgeVariant: BadgeVariant;
    /** 覆盖类名：用于 warning 等无内置 variant 的语义色 */
    overrideClassName?: string;
    labelKey: string;
  }
> = {
  healthy: {
    icon: CheckCircle,
    badgeVariant: 'success',
    labelKey: 'adminPage.monitor.statusHealthy',
  },
  degraded: {
    icon: AlertCircle,
    badgeVariant: 'secondary',
    overrideClassName: 'bg-warning/10 border-warning/20 text-warning',
    labelKey: 'adminPage.monitor.statusDegraded',
  },
  down: {
    icon: XCircle,
    badgeVariant: 'danger',
    labelKey: 'adminPage.dataManagement.statusInactive',
  },
};

/**
 * 服务健康状态徽章。
 * healthy→Badge success，down→Badge danger，degraded→secondary 变体叠加 warning 色覆盖。
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
      <Badge
        variant={config.badgeVariant}
        size="sm"
        className={cn('gap-0 px-1', config.overrideClassName)}
      >
        <Icon className={iconSize} />
      </Badge>
    );
  }

  return (
    <Badge variant={config.badgeVariant} size="default" className={config.overrideClassName}>
      <Icon className={iconSize} />
      <span>{t(config.labelKey)}</span>
    </Badge>
  );
}
