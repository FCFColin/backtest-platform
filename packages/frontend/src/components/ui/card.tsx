import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card surface container for grouped content.
 * @param props - Div props including className.
 * @returns The rendered card element.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-border bg-surface',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

/**
 * CardHeader: top region of a Card with title/description.
 * @param props - Div props including className.
 * @returns The rendered header element.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6 pb-5', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

/**
 * CardTitle: heading inside a CardHeader.
 * @param props - Heading props including className.
 * @returns The rendered h2 element.
 */
const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-h2 text-fg', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

/**
 * CardDescription: supporting caption under a CardTitle.
 * @param props - Paragraph props including className.
 * @returns The rendered p element.
 */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-caption text-fg-tertiary', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

/**
 * CardContent: main body region of a Card.
 * @param props - Div props including className.
 * @returns The rendered content element.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

/**
 * CardFooter: bottom region of a Card, flexbox-aligned.
 * @param props - Div props including className.
 * @returns The rendered footer element.
 */
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
