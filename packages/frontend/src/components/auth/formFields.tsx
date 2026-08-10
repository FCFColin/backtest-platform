import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { Button, Card } from '@/components/ui/uiComponents';
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
      <Card style={cardStyle}>
        {centered ? (
          <>
            {icon}
            <h1 className={cn('text-[20px] font-bold text-[var(--text-strong)]', icon && 'mb-2')}>
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
          <div className="mt-4 text-[13px] text-[var(--text-muted)] text-center">{footer}</div>
        )}
      </Card>
    </div>
  );
}
interface AuthSubmitButtonProps {
  loading: boolean;
  icon: ReactNode;
  label: string;
  loadingLabel: string;
}
export function AuthSubmitButton({ loading, icon, label, loadingLabel }: AuthSubmitButtonProps) {
  return (
    <Button type="submit" variant="primary" className="mt-1 h-[42px]" disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {loading ? loadingLabel : label}
    </Button>
  );
}
interface BrandIconBadgeProps {
  icon: ReactNode;
  size?: 'sm' | 'lg';
  style?: CSSProperties;
}
const SIZE_DIMENSIONS = {
  sm: { width: 40, height: 40, borderRadius: 10 },
  lg: { width: 44, height: 44, borderRadius: 12 },
};
export function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  const dims = SIZE_DIMENSIONS[size];
  return (
    <div
      className="flex items-center justify-center bg-[var(--brand)] text-brand-fg"
      style={{ ...dims, ...style }}
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
