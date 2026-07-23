import type { ReactNode } from 'react';

/** @file Tiny presentational primitives for DataEngineDashboard */

function progressColor(pctVal: number): string {
  if (pctVal >= 80) return 'var(--success)';
  if (pctVal >= 40) return 'var(--brand)';
  return 'var(--warning)';
}

export function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--brand)',
          marginBottom: 8,
        }}
      >
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export function ProgressBar({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  const pctVal = total > 0 ? (current / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}
      >
        <span style={{ color: 'var(--text-body)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {(current ?? 0).toLocaleString()} / {(total ?? 0).toLocaleString()} ({pctVal.toFixed(1)}%)
        </span>
      </div>
      <div
        style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4, overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${pctVal}%`,
            background: progressColor(pctVal),
            borderRadius: 4,
            transition: 'width 0.5s',
          }}
        />
      </div>
    </div>
  );
}
