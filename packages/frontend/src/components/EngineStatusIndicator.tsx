import { useEngineHealth, type EngineStatus } from '../hooks/useEngineHealth';

const STATUS_CONFIG: Record<EngineStatus, { icon: string; tooltip: string; color: string }> = {
  loading: { icon: '⏳', tooltip: '正在检查引擎状态...', color: 'var(--text-secondary)' },
  ok: { icon: '🟢', tooltip: 'Go 引擎已就绪', color: '#22c55e' },
  degraded: { icon: '🟡', tooltip: 'Go 引擎不可用，计算端点将返回 503', color: '#eab308' },
  error: { icon: '🔴', tooltip: '引擎不可用', color: '#ef4444' },
};

export function EngineStatusIndicator() {
  const { status, go, node } = useEngineHealth();
  const effectiveStatus: EngineStatus = status === 'ok' && node && !go ? 'degraded' : status;
  const { icon, tooltip, color } = STATUS_CONFIG[effectiveStatus];

  return (
    <div
      title={tooltip}
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
