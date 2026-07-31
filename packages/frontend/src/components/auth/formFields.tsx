import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
interface AuthSubmitButtonProps {
  loading: boolean;
  icon: ReactNode;
  label: string;
  loadingLabel: string;
}
const BUTTON_STYLE = {
  height: 42,
  marginTop: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8
} as const;
export function AuthSubmitButton({ loading, icon, label, loadingLabel }: AuthSubmitButtonProps) {
  return (
    <button type="submit" disabled={loading} className="main-action-btn" style={BUTTON_STYLE}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {loading ? loadingLabel : label}
    </button>
  );
}
interface BrandIconBadgeProps {
  icon: ReactNode;
  size?: 'sm' | 'lg';
  style?: CSSProperties;
}
const SIZE_DIMENSIONS: Record<'sm' | 'lg', { width: number; height: number; borderRadius: number }> = {
  sm: { width: 40, height: 40, borderRadius: 10 },
  lg: { width: 44, height: 44, borderRadius: 12 }
};
export function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  const dims = SIZE_DIMENSIONS[size];
  return <div style={{ ...dims, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{icon}</div>;
}
interface AuthFormFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  style?: CSSProperties;
}
const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-body)'
};
const FIELD_WRAP_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
export function AuthFormField({ label, value, onChange, type = 'text', autoComplete, required = true, minLength, style }: AuthFormFieldProps) {
  return (
    <label style={FIELD_WRAP_STYLE}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} minLength={minLength} className="bg-input-bg text-fg border border-border-subtle rounded font-medium" style={{ width: '100%', height: 40, ...style }} />
    </label>
  );
}
