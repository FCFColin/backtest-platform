export interface Member {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export const ROLES = ['admin', 'analyst', 'readonly'] as const;

export const TABLE_TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  padding: '8px 10px',
};

export const TABLE_TD: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-body)',
  padding: '8px 10px',
  borderTop: '1px solid var(--border, #e5e7eb)',
};
