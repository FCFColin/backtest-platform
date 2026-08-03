import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Field, FieldLabel } from '@/components/form/Field.js';
interface AuthPageLayoutProps {
  icon?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  centered?: boolean;
}
export default function AuthPageLayout({
  icon,
  title,
  children,
  footer,
  maxWidth = 420,
  centered = false,
}: AuthPageLayoutProps) {
  const cardStyle: CSSProperties = centered
    ? { padding: 28, marginTop: 40, textAlign: 'center' }
    : { padding: 28, marginTop: 40 };
  return (
    <div className="bt-page" style={{ maxWidth, margin: '0 auto' }}>
      <div className="bt-main-card card" style={cardStyle}>
        {centered ? (
          <>
            {icon}
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-strong)',
                ...(icon ? { marginBottom: 8 } : {}),
              }}
            >
              {title}
            </h1>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            {icon && <BrandIconBadge icon={icon} />}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              {title}
            </h1>
          </div>
        )}
        {children}
        {footer && (
          <div
            style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
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
  gap: 8,
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
const SIZE_DIMENSIONS: Record<
  'sm' | 'lg',
  { width: number; height: number; borderRadius: number }
> = {
  sm: { width: 40, height: 40, borderRadius: 10 },
  lg: { width: 44, height: 44, borderRadius: 12 },
};
export function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  const dims = SIZE_DIMENSIONS[size];
  return (
    <div
      style={{
        ...dims,
        background: 'var(--brand)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {icon}
    </div>
  );
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
export function AuthFormField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = true,
  minLength,
  style,
}: AuthFormFieldProps) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="bg-input-bg text-fg border border-border-subtle rounded font-medium"
        style={{ width: '100%', height: 40, ...style }}
      />
    </Field>
  );
}
