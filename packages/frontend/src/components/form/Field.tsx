import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('grid gap-1.5', className)} {...props} />
  ),
);
Field.displayName = 'Field';
const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => <Label ref={ref} className={cn(className)} {...props} />);
FieldLabel.displayName = 'FieldLabel';
const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-caption text-fg-tertiary', className)} {...props} />
));
FieldDescription.displayName = 'FieldDescription';
const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
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
});
FieldError.displayName = 'FieldError';
export { Field, FieldLabel, FieldDescription, FieldError };
