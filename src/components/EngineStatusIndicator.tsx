import { useEngineHealth } from '../hooks/useEngineHealth';

export function EngineStatusIndicator() {
  const { status, rust, node } = useEngineHealth();

  const getConfig = () => {
    if (status === 'loading') {
      return { icon: '⏳', tooltip: '正在检查引擎状态...', color: 'var(--text-secondary)' };
    }
    if (rust && node) {
      return { icon: '🟢', tooltip: 'Rust 引擎已加载', color: '#22c55e' };
    }
    if (!rust && node) {
      return { icon: '🟡', tooltip: '已降级到 JS 引擎', color: '#eab308' };
    }
    return { icon: '🔴', tooltip: '引擎不可用', color: '#ef4444' };
  };

  const { icon, tooltip, color } = getConfig();

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
