import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { cn } from '@/lib/utils';

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

/**
 * CollapsibleContent: panel that expands and collapses.
 * Uses the project's accordion-down/up keyframes (defined in tailwind.config.ts)
 * for smooth height transitions driven by Radix's CSS variable for content height.
 * @param props - Content props plus optional className.
 * @returns The rendered collapsible content element.
 */
const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      'overflow-hidden',
      'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
      className
    )}
    {...props}
  />
));
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
