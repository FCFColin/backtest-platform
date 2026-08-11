import * as React from 'react';
import { Label } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('grid gap-1.5', className)} {...props} />
  ),
);
Field.displayName = 'Field';
const FieldLabel = Label;
const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-caption text-fg-tertiary', className)} {...props} />
));
FieldDescription.displayName = 'FieldDescription';
export { Field, FieldLabel, FieldDescription };
