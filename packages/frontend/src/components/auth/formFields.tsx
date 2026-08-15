import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/utils.js';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { Card, Input } from '@/components/ui/uiComponents';
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
  return (
    <div className="page-container pt-0 pb-3 sm:pb-4" style={{ maxWidth, margin: '0 auto' }}>
      <Card className={cn('mt-10 p-7', centered && 'text-center')}>
        {centered ? (
          <>
            {icon}
            <h1 className={cn('text-page-title font-bold text-fg', icon && 'mb-2')}>{title}</h1>
          </>
        ) : (
          <div className="mb-5 flex items-center gap-2.5">
            {icon && <BrandIconBadge icon={icon} />}
            <h1 className="text-page-title font-bold text-fg">{title}</h1>
          </div>
        )}
        {children}
        {footer && <div className="mt-4 text-label text-fg-tertiary text-center">{footer}</div>}
      </Card>
    </div>
  );
}

interface BrandIconBadgeProps {
  icon: ReactNode;
  size?: 'sm' | 'lg';
  style?: CSSProperties;
}
const SIZE_CLASS = {
  sm: 'size-10 rounded-[10px]',
  lg: 'size-11 rounded-[12px]',
} as const;
export function BrandIconBadge({ icon, size = 'sm', style }: BrandIconBadgeProps) {
  return (
    <div
      className={cn('flex items-center justify-center bg-brand text-brand-fg', SIZE_CLASS[size])}
      style={style}
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
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        style={style}
      />
    </Field>
  );
}
