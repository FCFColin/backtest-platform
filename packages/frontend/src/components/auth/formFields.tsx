import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils.js';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { Card } from '@/components/ui/uiComponents';
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
    <div className="page-container pt-0 pb-3 sm:pb-4" style={{ maxWidth, margin: '0 auto' }}>
      <Card style={cardStyle}>
        {centered ? (
          <>
            {icon}
            <h1 className={cn('text-[20px] font-bold text-fg', icon && 'mb-2')}>{title}</h1>
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
        {footer && <div className="mt-4 text-label text-fg-tertiary text-center">{footer}</div>}
      </Card>
    </div>
  );
}
export function LoginRequiredCard({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="page-container pt-0 pb-3 sm:pb-4 max-w-[720px]">
      <Card className="p-7 mt-10 text-center">
        <p className="text-fg-tertiary">
          {t('Please')}{' '}
          <Link to="/login" className="text-brand">
            {t('Log In')}
          </Link>{' '}
          {message}
        </p>
      </Card>
    </div>
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
      className="flex items-center justify-center bg-brand text-brand-fg"
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
  const inputId = useId();
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <input
        id={inputId}
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
