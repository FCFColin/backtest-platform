import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Badge, type BadgeProps } from '../ui/uiComponents.js';
import { cn } from '../../lib/utils.js';
type ServiceStatus = 'healthy' | 'degraded' | 'down';
type BadgeVariant = NonNullable<BadgeProps['variant']>;
interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  variant?: 'pill' | 'dot';
  size?: 'sm' | 'md';
}
const STATUS_CONFIG: Record<
  ServiceStatus,
  {
    icon: typeof CheckCircle;
    badgeVariant: BadgeVariant;
    overrideClassName?: string;
    labelKey: string;
  }
> = {
  healthy: {
    icon: CheckCircle,
    badgeVariant: 'success',
    labelKey: 'adminPage.monitor.statusHealthy'
  },
  degraded: {
    icon: AlertCircle,
    badgeVariant: 'secondary',
    overrideClassName: 'bg-warning/10 border-warning/20 text-warning',
    labelKey: 'adminPage.monitor.statusDegraded'
  },
  down: {
    icon: XCircle,
    badgeVariant: 'danger',
    labelKey: 'adminPage.dataManagement.statusInactive'
  }
};
export function ServiceStatusBadge({ status, variant = 'pill', size = 'sm' }: ServiceStatusBadgeProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  if (variant === 'dot') {
    return (
      <Badge variant={config.badgeVariant} size="sm" className={cn('gap-0 px-1', config.overrideClassName)}>
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
