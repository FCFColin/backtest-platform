import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RadioGroup: layout container for a set of radio options.
 * Renders as a grid with gap-2 spacing.
 * @param props - Radix Radio Group Root props including className.
 * @returns The rendered radio group root element.
 */
const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    className={cn('grid gap-2', className)}
    {...props}
  />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

/**
 * RadioGroupItem: an individual radio option. Uses border-border-strong for a
 * visible ring against dark surfaces, and a lucide Circle indicator (fill-brand)
 * for the selected state. Focus ring uses brand/15 to stay subtle.
 * @param props - Radix Radio Group Item props including className.
 * @returns The rendered radio item element with a selected-state indicator.
 */
const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square h-4 w-4 rounded-full border border-border-strong text-brand',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/15',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-brand',
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-3.5 fill-brand text-brand" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
