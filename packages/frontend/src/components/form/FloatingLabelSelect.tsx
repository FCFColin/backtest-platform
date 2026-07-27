/**
 * @file FloatingLabelSelect 组件
 * @description 浮动标签下拉选择框：基于项目已有 shadcn Select 组件（Radix UI）。
 *   h-14(56px) 圆角边框，标签绝对定位在左上角，ChevronDown 图标在右下。
 */
import { forwardRef, useId } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select.js';
import { cn } from '@/lib/utils';

interface FloatingLabelSelectProps {
  /** 浮动标签文本 */
  label: string;
  /** 当前选中值 */
  value?: string;
  /** 值变更回调 */
  onValueChange?: (value: string) => void;
  /** 选项列表 */
  options: Array<{ value: string; label: string }>;
  /** 错误信息 */
  error?: string;
  /** 提示信息 */
  hint?: string;
  /** 占位符 */
  placeholder?: string;
  /** 容器额外样式类 */
  containerClassName?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 浮动标签下拉选择框组件。
 * @param props - label/value/onValueChange/options/error/hint/placeholder。
 * @returns 带浮动标签的下拉选择框元素。
 */
export const FloatingLabelSelect = forwardRef<HTMLButtonElement, FloatingLabelSelectProps>(
  (
    { label, value, onValueChange, options, error, hint, placeholder, containerClassName, disabled },
    ref,
  ) => {
    const inputId = useId();

    return (
      <div className={cn('relative', containerClassName)}>
        <div
          className={cn(
            'relative h-14 rounded-md border transition-colors duration-150',
            'bg-input-bg',
            error ? 'border-danger' : 'border-border hover:border-border-strong',
            'group',
          )}
        >
          <label
            htmlFor={inputId}
            className="absolute left-3 top-1.5 z-10 pointer-events-none text-label-tiny text-fg-tertiary"
          >
            {label}
          </label>

          <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger
              ref={ref}
              id={inputId}
              className={cn(
                'w-full h-full pt-6 pb-2 px-3 pr-9',
                'flex items-center justify-between',
                'text-body text-fg text-left',
                'border-0 bg-transparent focus:outline-none focus:ring-0',
                '[&>svg]:absolute [&>svg]:right-3 [&>svg]:bottom-3.5 [&>svg]:opacity-100',
              )}
            >
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
  },
);
FloatingLabelSelect.displayName = 'FloatingLabelSelect';
