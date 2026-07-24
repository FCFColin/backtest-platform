/**
 * @file Field — 统一表单 Field 包装
 * @description 提供 Field / FieldLabel / FieldDescription / FieldError 四件套，
 *   结构与 react-hook-form 的 register/errors 模式兼容：
 *   <Field><FieldLabel htmlFor="x"/><Input id="x" {...register('x')}/><FieldError>{errors.x?.message}</FieldError></Field>
 */
import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Field: 表单字段容器，垂直网格间距。
 * @param props - div 属性
 * @returns 渲染的字段容器
 */
const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('grid gap-1.5', className)} {...props} />
  )
);
Field.displayName = 'Field';

/**
 * FieldLabel: 字段标签，复用 shadcn Label（基于 Radix Label，支持 htmlFor）。
 * @param props - Label 属性
 * @returns 渲染的标签
 */
const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => (
  <Label ref={ref} className={cn(className)} {...props} />
));
FieldLabel.displayName = 'FieldLabel';

/**
 * FieldDescription: 字段辅助说明文案。
 * @param props - 段落属性
 * @returns 渲染的说明文案
 */
const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-caption text-fg-tertiary', className)} {...props} />
));
FieldDescription.displayName = 'FieldDescription';

/**
 * FieldError: 字段错误文案，前置 AlertCircle 图标。
 * @param props - 段落属性（children 为错误文案）
 * @returns 渲染的错误文案，无 children 时返回 null
 */
const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        role="alert"
        className={cn('flex items-center gap-1 text-caption text-danger', className)}
        {...props}
      >
        <AlertCircle className="size-3 shrink-0" />
        {children}
      </p>
    );
  }
);
FieldError.displayName = 'FieldError';

export { Field, FieldLabel, FieldDescription, FieldError };
