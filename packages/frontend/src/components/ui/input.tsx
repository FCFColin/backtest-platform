import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input component themed for the dark financial platform.
 * Number inputs use a monospaced tabular font for aligned digits.
 * @param props - Standard input props.
 * @returns The rendered input element.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md',
          'bg-input-bg border border-border',
          'px-3 py-2 text-body text-fg',
          'placeholder:text-fg-tertiary',
          'hover:border-border-strong',
          'focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15',
          'transition-colors duration-150',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-body file:font-medium',
          // 数字输入用等宽
          type === 'number' && 'font-mono tabular-nums',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
