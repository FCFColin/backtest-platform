import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

/**
 * Switch component built on Radix Switch primitive.
 * Track uses brand color when on; the light thumb (bg-fg) slides horizontally
 * to clearly signal state on the dark surface.
 * @param props - Switch props plus optional className.
 * @returns The rendered switch with a sliding thumb.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center',
      'rounded-full border border-border bg-input-bg',
      'transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 focus-visible:ring-offset-2 focus-visible:ring-offset-app',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-brand data-[state=checked]:border-brand',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-4 rounded-full bg-fg shadow-lg',
        'ring-0 transition-transform duration-150 ease-out-quart',
        'translate-x-0.5',
        'data-[state=checked]:translate-x-[18px]'
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
