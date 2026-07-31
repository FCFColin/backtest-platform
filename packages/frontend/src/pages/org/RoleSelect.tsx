import type { CSSProperties } from 'react';
import { ROLES, type Role } from './orgTypes.js';
interface RoleSelectProps {
  value: string;
  disabled?: boolean;
  onChange: (role: Role) => void;
  className?: string;
  style?: CSSProperties;
}
export function RoleSelect({ value, disabled, onChange, className, style }: RoleSelectProps) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Role)} className={className} style={style}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
