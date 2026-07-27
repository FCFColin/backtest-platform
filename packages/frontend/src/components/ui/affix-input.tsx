import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/** AffixInput Props：在 Input 基础上支持内嵌前缀/后缀（如 $、%、月）。Omit 原生 prefix 属性避免命名冲突 */
export interface AffixInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** 内嵌前缀内容（左对齐，pointer-events 禁用） */
  prefix?: React.ReactNode;
  /** 内嵌后缀内容（右对齐，pointer-events 禁用） */
  suffix?: React.ReactNode;
}

/**
 * 带内嵌前后缀的输入框。
 * 前后缀渲染在输入框内部两侧（testfol.io 风格），比外置符号更紧凑整齐。
 * @param props - 见 AffixInputProps
 * @returns 渲染的输入框
 */
const AffixInput = React.forwardRef<HTMLInputElement, AffixInputProps>(
  ({ className, prefix, suffix, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {prefix !== undefined && (
          <span className="pointer-events-none absolute left-3 z-10 font-mono text-body text-fg-tertiary">
            {prefix}
          </span>
        )}
        <Input
          ref={ref}
          className={cn(prefix !== undefined && 'pl-7', suffix !== undefined && 'pr-8', className)}
          {...props}
        />
        {suffix !== undefined && (
          <span className="pointer-events-none absolute right-3 z-10 text-caption text-fg-tertiary">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
AffixInput.displayName = 'AffixInput';

export { AffixInput };
