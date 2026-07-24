import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-fg-tertiary [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-elevated border-border text-fg',
        destructive: 'bg-danger/10 border-danger/30 text-fg [&>svg]:text-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Alert component for inline messaging.
 * @param props - Div props plus variant option.
 * @returns The rendered alert element.
 */
const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

/**
 * AlertTitle: heading inside an Alert.
 * @param props - Heading props including className.
 * @returns The rendered h5 element.
 */
const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('text-h3 text-fg font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

/**
 * AlertDescription: body text inside an Alert.
 * @param props - Div props including className.
 * @returns The rendered description element.
 */
const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-body text-fg-secondary [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
