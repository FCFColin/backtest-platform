import { forwardRef, useId } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/uiComponents.js';
import { cn } from '@/lib/utils';
interface FloatingLabelSelectProps {
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  hint?: string;
  placeholder?: string;
  containerClassName?: string;
  disabled?: boolean;
}
export const FloatingLabelSelect = forwardRef<HTMLButtonElement, FloatingLabelSelectProps>(({ label, value, onValueChange, options, error, hint, placeholder, containerClassName, disabled }, ref) => {
  const inputId = useId();
  return (
    <div className={cn('relative', containerClassName)}>
      <div className={cn('relative h-14 rounded-md border transition-colors duration-150', 'bg-input-bg', error ? 'border-danger' : 'border-border hover:border-border-strong', 'group')}>
        <label htmlFor={inputId} className="absolute left-3 top-1.5 z-10 pointer-events-none text-label-tiny text-fg-tertiary">
          {label}
        </label>
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger ref={ref} id={inputId} className={cn('w-full h-full pt-6 pb-2 px-3 pr-9', 'flex items-center justify-between', 'text-body text-fg text-left', 'border-0 bg-transparent focus:outline-none focus:ring-0', '[&>svg]:absolute [&>svg]:right-3 [&>svg]:bottom-3.5 [&>svg]:opacity-100')}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
    </div>
  );
});
FloatingLabelSelect.displayName = 'FloatingLabelSelect';
