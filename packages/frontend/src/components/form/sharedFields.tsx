import type { ReactNode, ComponentProps } from 'react';
import { useId } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Checkbox,
  type InputProps,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from './Field.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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
  return (
    <div className="relative">
      <Input type="number" className={showPercent ? 'pr-8' : undefined} {...props} />
      {showPercent && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
          %
        </span>
      )}
    </div>
  );
}

export function DollarInput(props: InputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
        $
      </span>
      <Input type="number" className="pl-7" {...props} />
    </div>
  );
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
  size,
  className = 'w-full',
}: {
  isLoading: boolean;
  onClick: () => void;
  label: string;
  loadingLabel: string;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {isLoading ? loadingLabel : label}
    </Button>
  );
}

export function DateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  showAllHistory = false,
  allHistory,
  onAllHistoryChange,
  startId,
  endId,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  showAllHistory?: boolean;
  allHistory?: boolean;
  onAllHistoryChange?: (v: boolean) => void;
  startId?: string;
  endId?: string;
}) {
  const { t } = useTranslation();
  const autoStartId = useId();
  const autoEndId = useId();
  const sid = startId ?? autoStartId;
  const eid = endId ?? autoEndId;
  return (
    <>
      {showAllHistory && (
        <Field className="col-span-full">
          <label className="flex cursor-pointer items-center gap-2 text-label text-fg-secondary">
            <Checkbox
              checked={allHistory ?? false}
              onCheckedChange={(c) => {
                if (c === true) {
                  onStartDateChange('');
                  onEndDateChange('');
                  onAllHistoryChange?.(true);
                } else {
                  onStartDateChange(DEFAULT_BACKTEST_START_DATE);
                  onEndDateChange(DEFAULT_END_DATE);
                  onAllHistoryChange?.(false);
                }
              }}
            />
            {t('optimizer.allHistory')}
          </label>
        </Field>
      )}
      <LabeledField htmlFor={sid} label={t('common.startDate')}>
        <Input
          id={sid}
          type="date"
          value={startDate}
          disabled={allHistory}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </LabeledField>
      <LabeledField htmlFor={eid} label={t('common.endDate')}>
        <Input
          id={eid}
          type="date"
          value={endDate}
          disabled={allHistory}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
      </LabeledField>
    </>
  );
}
