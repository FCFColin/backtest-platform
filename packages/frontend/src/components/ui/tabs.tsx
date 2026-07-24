import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/**
 * TabsList: container for tab triggers.
 * Uses bg-input-bg with a border to read as a distinct control surface.
 * @param props - TabsList props including className.
 * @returns The rendered tabs list element.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center justify-center bg-input-bg border border-border rounded-md p-1',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * TabsTrigger: an individual tab trigger.
 * Active state uses bg-hover text-fg; inactive uses text-fg-tertiary.
 * @param props - TabsTrigger props including className.
 * @returns The rendered tab trigger element.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-body font-medium transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-hover data-[state=active]:text-fg',
      'data-[state=inactive]:text-fg-tertiary',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/**
 * TabsContent: the panel rendered for an active tab.
 * @param props - TabsContent props including className.
 * @returns The rendered tabs content element.
 */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
