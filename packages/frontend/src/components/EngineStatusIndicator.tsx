import { useTranslation } from 'react-i18next';
import { useEngineHealth, type EngineStatus } from '../hooks/useEngineHealth.js';

const STATUS_CONFIG: Record<EngineStatus, { icon: string; tooltipKey: string; color: string }> = {
  loading: {
    icon: '⏳',
    tooltipKey: 'components.engineStatusIndicator.tooltips.loading',
    color: 'var(--text-secondary)',
  },
  ok: { icon: '🟢', tooltipKey: 'components.engineStatusIndicator.tooltips.ok', color: '#22c55e' },
  degraded: {
    icon: '🟡',
    tooltipKey: 'components.engineStatusIndicator.tooltips.degraded',
    color: '#eab308',
  },
  error: {
    icon: '🔴',
    tooltipKey: 'components.engineStatusIndicator.tooltips.error',
    color: '#ef4444',
  },
};

export function EngineStatusIndicator() {
  const { t } = useTranslation();
  const { status, go } = useEngineHealth();
  const effectiveStatus: EngineStatus = status === 'ok' && !go ? 'degraded' : status;
  const { icon, tooltipKey, color } = STATUS_CONFIG[effectiveStatus];

  return (
    <div
      title={t(tooltipKey)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'help',
        fontSize: '1.1rem',
        color,
        padding: '0 4px',
      }}
    >
      {icon}
    </div>
  );
}
