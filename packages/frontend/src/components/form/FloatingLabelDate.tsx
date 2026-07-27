/**
 * @file FloatingLabelDate 组件
 * @description 浮动标签日期选择框：结构同 FloatingLabelInput，但 type="date"。
 *   右侧有 Calendar 图标（absolute right-3 bottom-2）。
 */
import { forwardRef, InputHTMLAttributes, useId } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingLabelDateProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 浮动标签文本 */
  label: string;
  /** 错误信息 */
  error?: string;
  /** 提示信息 */
  hint?: string;
  /** 容器额外样式类 */
  containerClassName?: string;
}

/**
 * 浮动标签日期选择框组件。
 * @param props - 继承 InputHTMLAttributes，扩展 label/error/hint。
 * @returns 带浮动标签和 Calendar 图标的日期输入框元素。
 */
export const FloatingLabelDate = forwardRef<HTMLInputElement, FloatingLabelDateProps>(
  ({ label, error, hint, className, containerClassName, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            'relative h-14 rounded-md border transition-colors duration-150',
            'bg-input-bg',
            error
              ? 'border-danger focus-within:border-danger'
              : 'border-border focus-within:border-brand',
            'group',
          )}
        >
          <label
            htmlFor={inputId}
            className={cn(
              'absolute left-3 top-1.5 z-10 pointer-events-none',
              'text-label-tiny text-fg-tertiary',
              'transition-colors duration-150',
              'group-focus-within:text-brand',
            )}
          >
            {label}
          </label>

          <input
            ref={ref}
            id={inputId}
            type="date"
            className={cn(
              'w-full h-full pt-6 pb-2 pl-3 pr-10 bg-transparent',
              'text-body text-fg font-mono tabular-nums',
              'focus:outline-none',
              className,
            )}
            {...props}
          />

          <Calendar className="absolute right-3 bottom-2 h-4 w-4 text-fg-tertiary pointer-events-none" />
        </div>

        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
      </div>
    );
  },
);
FloatingLabelDate.displayName = 'FloatingLabelDate';
