import type { CSSProperties } from 'react';

export const FIELD_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px' };
export const LABEL_STYLE: CSSProperties = { fontSize: '11px', color: 'var(--text-muted)' };
export const GP_FORM_STYLE: CSSProperties = {
  padding: '12px 16px',
  marginBottom: '8px',
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-soft)',
};
export const GP_TITLE_STYLE: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-strong)',
  marginBottom: '8px',
};
export const GP_CONFIG_STYLE: CSSProperties = {
  padding: '8px 10px',
  marginBottom: '6px',
  backgroundColor: 'var(--bg-elevated)',
  borderRadius: '6px',
  border: '1px solid var(--border-soft)',
};
export const GP_CONFIG_TITLE_STYLE: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--accent)',
  marginBottom: '6px',
  letterSpacing: '0.02em',
};
export const FIELDS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'flex-end',
};
