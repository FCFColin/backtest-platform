/**
 * @file FloatingLabelInput 组件
 * @description 浮动标签输入框：h-14(56px) 圆角边框，标签绝对定位在左上角。
 *   支持 prefix/suffix/error/hint，focus-within 时边框变为 brand 色。
 *   使用 forwardRef + useId 确保无障碍关联。
 */
import { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

interface FloatingLabelInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** 浮动标签文本（显示在左上角，小字大写） */
  label: string;
  /** 前缀节点，如 "$" */
  prefix?: ReactNode;
  /** 后缀节点，如 "months"、"%" */
  suffix?: ReactNode;
  /** 错误信息（显示在输入框下方） */
  error?: string;
  /** 提示信息（无错误时显示在输入框下方） */
  hint?: string;
  /** 容器额外样式类 */
  containerClassName?: string;
}

/**
 * 浮动标签输入框组件。
 * @param props - 继承 InputHTMLAttributes，扩展 label/prefix/suffix/error/hint。
 * @returns 带浮动标签的输入框元素。
 */
export const FloatingLabelInput = forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ label, prefix, suffix, error, hint, className, containerClassName, id, ...props }, ref) => {
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

          {prefix && (
            <span className="absolute left-3 bottom-2 text-body text-fg-tertiary pointer-events-none">
              {prefix}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-full pt-6 pb-2 bg-transparent',
              'text-body text-fg font-mono tabular-nums',
              'focus:outline-none placeholder:text-fg-tertiary',
              prefix ? 'pl-7' : 'pl-3',
              suffix ? 'pr-16' : 'pr-3',
              className,
            )}
            {...props}
          />

          {suffix && (
            <span className="absolute right-3 bottom-2 text-caption text-fg-tertiary pointer-events-none">
              {suffix}
            </span>
          )}
        </div>

        {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        {!error && hint && <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>}
      </div>
    );
  },
);
FloatingLabelInput.displayName = 'FloatingLabelInput';
