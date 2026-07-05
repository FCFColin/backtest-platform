export const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

export function getLoadingColor(val: number): string {
  if (val >= 0.8) return '#1a7a3a';
  if (val >= 0.6) return '#2e8b57';
  if (val >= 0.4) return '#6abf7e';
  if (val >= 0.2) return '#b8e0c4';
  if (val > -0.2) return 'var(--bg-subtle)';
  if (val > -0.4) return '#f0c8c8';
  if (val > -0.6) return '#d47070';
  if (val > -0.8) return '#b04040';
  return '#8b2020';
}
