import type { OrgRole } from '@backtest/shared/types/org';
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
export type Role = Exclude<OrgRole, 'owner'>;
