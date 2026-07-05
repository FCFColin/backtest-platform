import { useDegradedStore } from '../store/degradedStore';

export function DegradedBanner() {
  const degraded = useDegradedStore((s) => s.degraded);
  const warning = useDegradedStore((s) => s.degradedWarning);

  if (!degraded) return null;

  return (
    <div
      role="alert"
      style={{
        background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-elevated))',
        borderBottom: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
        padding: '8px 16px',
        fontSize: '13px',
        color: 'var(--warning)',
        lineHeight: 1.5,
        textAlign: 'center',
      }}
    >
      <span style={{ fontWeight: 600 }}>Degraded mode:</span>{' '}
      {warning || 'Some features may be unavailable or using fallback data.'}
    </div>
  );
}
