import { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';
interface FloatingLabelInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
  containerClassName?: string;
}
export const FloatingLabelInput = forwardRef<HTMLInputElement, FloatingLabelInputProps>(({ label, prefix, suffix, error, hint, className, containerClassName, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={cn('relative', containerClassName)}>
      <div className={cn('relative h-14 rounded-md border transition-colors duration-150 bg-input-bg', error ? 'border-danger focus-within:border-danger' : 'border-border focus-within:border-brand', 'group')}>
        <label htmlFor={inputId} className={cn('absolute left-3 top-1.5 z-10 pointer-events-none', 'text-label-tiny text-fg-tertiary', 'transition-colors duration-150', 'group-focus-within:text-brand')}>
          {label}
        </label>
        {prefix && <span className="absolute left-3 bottom-2 text-body text-fg-tertiary pointer-events-none">{prefix}</span>}
        <input ref={ref} id={inputId} className={cn('w-full h-full pt-6 pb-2 bg-transparent', 'text-body text-fg font-mono tabular-nums', 'focus:outline-none placeholder:text-fg-tertiary', prefix ? 'pl-7' : 'pl-3', suffix ? 'pr-16' : 'pr-3', className)} {...props} />
        {suffix && <span className="absolute right-3 bottom-2 text-caption text-fg-tertiary pointer-events-none">{suffix}</span>}
      </div>
      {error && <p className="mt-1 text-caption text-danger">{error}</p>}
      {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
    </div>
  );
});
FloatingLabelInput.displayName = 'FloatingLabelInput';
