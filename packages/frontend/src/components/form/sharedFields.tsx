import type { ReactNode, ComponentProps } from 'react';
import { Play } from 'lucide-react';
import {
  LoadingButton,
  Input,
  AffixInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  type InputProps,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from './Field.js';
import { useSettingsStore } from '@/store/settingsStore';
export function SectionHeader({
  title,
  info,
  variant = 'h3',
}: {
  title: string;
  info?: string;
  variant?: 'h3' | 'label';
}) {
  return (
    <div>
      {variant === 'h3' ? (
        <h3 className="text-h3 font-semibold text-fg">{title}</h3>
      ) : (
        <div className="text-label font-semibold text-fg">{title}</div>
      )}
      {info && <p className="mt-0.5 text-caption text-fg-tertiary">{info}</p>}
    </div>
  );
}
export function LabeledField({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </Field>
  );
}
export function DateField({
  id,
  label,
  value,
  onChange,
  fallback,
  disabled,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback?: string;
  disabled?: boolean;
}) {
  return (
    <LabeledField htmlFor={id} label={label}>
      <Input
        id={id}
        type="date"
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </LabeledField>
  );
}
export function SelectField<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id?: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <LabeledField htmlFor={id} label={label}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LabeledField>
  );
}
export function PercentInput({
  showPercent = true,
  ...props
}: InputProps & { showPercent?: boolean }) {
  return showPercent ? (
    <AffixInput type="number" suffix="%" {...props} />
  ) : (
    <Input type="number" {...props} />
  );
}
export function DollarInput(props: InputProps) {
  const currency = useSettingsStore((s) => s.currency);
  return <AffixInput type="number" prefix={currency === 'cny' ? '¥' : '$'} {...props} />;
}
export function SwitchField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </Field>
  );
}
export function RunButton({
  isLoading,
  onClick,
  label,
  loadingLabel,
  variant = 'primary',
  className = 'w-full',
  disabled,
  ...rest
}: {
  isLoading: boolean;
  onClick: () => void;
  label: string;
  loadingLabel: string;
  variant?: ComponentProps<typeof LoadingButton>['variant'];
  className?: string;
  disabled?: boolean;
} & ComponentProps<typeof LoadingButton>) {
  return (
    <LoadingButton
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
      loadingText={loadingLabel}
      className={className}
      {...rest}
    >
      <Play className="size-4" />
      {label}
    </LoadingButton>
  );
}
