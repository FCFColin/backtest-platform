/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Circle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WrapComp = React.ComponentType<any> | keyof React.JSX.IntrinsicElements;
const wrapPrimitive = <T extends WrapComp>(
  Comp: T,
  baseClass: string,
  displayName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: (children: ReactNode, props: any) => ReactNode,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Element = Comp as React.JSXElementConstructor<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Wrapped = React.forwardRef<any, React.ComponentPropsWithoutRef<T>>(
    ({ className, children, ...props }, ref) => (
      <Element ref={ref} className={cn(baseClass, className as string)} {...props}>
        {content ? content(children, props) : children}
      </Element>
    ),
  );
  Wrapped.displayName =
    displayName ?? (Comp as { displayName?: string }).displayName ?? 'Primitive';
  return Wrapped;
};

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
  {
    variants: {
      variant: {
        asset: 'bg-brand/10 border-brand/20 text-brand hover:bg-brand/15',
        secondary:
          'bg-input-bg border-border text-fg-secondary hover:text-fg hover:border-border-strong',
        success: 'bg-success/10 border-success/20 text-success',
        danger: 'bg-danger/10 border-danger/20 text-danger',
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        default: 'h-7 px-3 text-caption',
      },
    },
    defaultVariants: { variant: 'asset', size: 'default' },
  },
);
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, size, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
);

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 ease-out-quart disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] disabled:bg-brand/30 disabled:text-brand-fg/50',
        secondary:
          'bg-input-bg text-fg-secondary border border-border hover:bg-hover hover:text-fg hover:border-border-strong active:scale-[0.98] disabled:opacity-40',
        ghost:
          'bg-transparent text-brand hover:text-brand-hover hover:bg-brand/10 disabled:opacity-40',
        destructive:
          'bg-transparent text-fg-tertiary hover:bg-danger/10 hover:text-danger active:scale-[0.98] disabled:opacity-40',
        icon: 'bg-transparent text-fg-tertiary hover:bg-hover hover:text-fg rounded-md disabled:opacity-40',
      },
      size: {
        sm: 'h-8 px-3 text-caption [&_svg]:size-3.5',
        default: 'h-9 px-4 text-body [&_svg]:size-4',
        lg: 'h-11 px-6 text-body font-semibold [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);
interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg placeholder:text-fg-tertiary hover:border-border-strong focus:outline-none focus:border-brand transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-body file:font-medium',
        type === 'number' && 'font-mono tabular-nums',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

interface AffixInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}
export const AffixInput = React.forwardRef<HTMLInputElement, AffixInputProps>(
  ({ className, prefix, suffix, ...props }, ref) => (
    <div className="relative flex items-center">
      {prefix !== undefined && (
        <span className="pointer-events-none absolute left-3 z-10 font-mono text-body text-fg-tertiary">
          {prefix}
        </span>
      )}
      <Input
        ref={ref}
        className={cn(prefix !== undefined && 'pl-7', suffix !== undefined && 'pr-8', className)}
        {...props}
      />
      {suffix !== undefined && (
        <span className="pointer-events-none absolute right-3 z-10 text-caption text-fg-tertiary">
          {suffix}
        </span>
      )}
    </div>
  ),
);

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-fg-tertiary [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-elevated border-border text-fg',
        destructive: 'bg-danger/10 border-danger/30 text-fg [&>svg]:text-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
export const AlertDescription = wrapPrimitive(
  'div',
  'text-body text-fg-secondary [&_p]:leading-relaxed',
  'AlertDescription',
);

export const Card = wrapPrimitive('div', 'rounded-xl border border-border bg-surface', 'Card');
export const CardHeader = wrapPrimitive('div', 'flex flex-col space-y-1.5 p-6 pb-5', 'CardHeader');
export const CardTitle = wrapPrimitive('h2', 'text-h2 text-fg', 'CardTitle');
export const CardContent = wrapPrimitive('div', 'p-6 pt-0', 'CardContent');

export const Checkbox = wrapPrimitive(
  CheckboxPrimitive.Root,
  'peer h-4 w-4 shrink-0 rounded-sm border border-border-strong bg-input-bg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-brand-fg',
  'Checkbox',
  () => (
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  ),
);

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = wrapPrimitive(
  CollapsiblePrimitive.Content,
  'overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
  'CollapsibleContent',
);

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const itemBase =
  'relative flex cursor-pointer select-none items-center rounded-md text-body text-fg-secondary outline-none transition-colors duration-150 focus:bg-hover focus:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50';
const contentAnim =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2';
const CheckIndicator = ({ children }: { children: ReactNode }) => (
  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">{children}</span>
);
export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden bg-elevated border border-border rounded-lg shadow-lg p-1 text-fg',
        contentAnim,
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
export const DropdownMenuItem = wrapPrimitive(
  DropdownMenuPrimitive.Item,
  cn(itemBase, 'px-2 py-1.5 [&_svg]:size-4 [&_svg]:mr-2'),
  'DropdownMenuItem',
);
export const DropdownMenuCheckboxItem = wrapPrimitive(
  DropdownMenuPrimitive.CheckboxItem,
  cn(itemBase, 'py-1.5 pl-8 pr-2'),
  'DropdownMenuCheckboxItem',
  (children) => (
    <>
      <CheckIndicator>
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-brand" />
        </DropdownMenuPrimitive.ItemIndicator>
      </CheckIndicator>
      {children}
    </>
  ),
);

export const Label = wrapPrimitive(
  LabelPrimitive.Root,
  'text-label font-medium text-fg-secondary leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  'Label',
);

export const Progress = wrapPrimitive(
  ProgressPrimitive.Root,
  'relative h-2 w-full overflow-hidden bg-input-bg rounded-full',
  'Progress',
  (_, { value }) => (
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-brand rounded-full transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  ),
);

export const RadioGroup = wrapPrimitive(RadioGroupPrimitive.Root, 'grid gap-2', 'RadioGroup');
export const RadioGroupItem = wrapPrimitive(
  RadioGroupPrimitive.Item,
  'aspect-square h-4 w-4 rounded-full border border-border-strong text-brand disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand',
  'RadioGroupItem',
  () => (
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-3.5 fill-brand text-brand" />
    </RadioGroupPrimitive.Indicator>
  ),
);

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = wrapPrimitive(
  SelectPrimitive.Trigger,
  'flex h-10 w-full items-center justify-between rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg placeholder:text-fg-tertiary hover:border-border-strong focus:outline-none focus:border-brand transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
  'SelectTrigger',
  (children) => (
    <>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </>
  ),
);
const SelectScrollUpButton = wrapPrimitive(
  SelectPrimitive.ScrollUpButton,
  'flex cursor-default items-center justify-center py-1',
  'SelectScrollUpButton',
  () => <ChevronUp className="h-4 w-4 text-fg-tertiary" />,
);
const SelectScrollDownButton = wrapPrimitive(
  SelectPrimitive.ScrollDownButton,
  'flex cursor-default items-center justify-center py-1',
  'SelectScrollDownButton',
  () => <ChevronDown className="h-4 w-4 text-fg-tertiary" />,
);
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden bg-elevated border border-border rounded-lg shadow-lg text-fg',
        contentAnim,
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;
export const SelectItem = wrapPrimitive(
  SelectPrimitive.Item,
  'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-body text-fg-secondary outline-none transition-colors duration-150 focus:bg-hover focus:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:text-brand',
  'SelectItem',
  (children) => (
    <>
      <CheckIndicator>
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </CheckIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </>
  ),
);
export { SelectContent };

export const Separator = ({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) => (
  <SeparatorPrimitive.Root
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border-subtle',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
);

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse rounded-md bg-input-bg', className)} {...props} />
);

export const Switch = wrapPrimitive(
  SwitchPrimitive.Root,
  'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-input-bg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand data-[state=checked]:border-brand',
  'Switch',
  () => (
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-fg shadow-lg ring-0 transition-transform duration-150 ease-out-quart translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
  ),
);

export const Tabs = TabsPrimitive.Root;
export const TabsList = wrapPrimitive(
  TabsPrimitive.List,
  'inline-flex h-9 items-center justify-center bg-input-bg border border-border rounded-md p-1',
  'TabsList',
);
export const TabsTrigger = wrapPrimitive(
  TabsPrimitive.Trigger,
  'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-body font-medium transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-hover data-[state=active]:text-fg data-[state=inactive]:text-fg-tertiary',
  'TabsTrigger',
);
export const TabsContent = wrapPrimitive(TabsPrimitive.Content, 'mt-2', 'TabsContent');

export const Tooltip = ({ children }: { children: ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={200}>
    <TooltipPrimitive.Root>{children}</TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal',
        contentAnim,
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
interface LoadingButtonProps extends ButtonProps {
  isLoading: boolean;
  loadingText?: string;
}
export function LoadingButton({
  isLoading,
  loadingText,
  type = 'button',
  variant = 'primary',
  disabled,
  children,
  ...rest
}: LoadingButtonProps) {
  const { t } = useTranslation();
  return (
    <Button type={type} variant={variant} disabled={isLoading || disabled} {...rest}>
      {isLoading && <Loader2 className="animate-spin" />}
      {isLoading ? (loadingText ?? t('Loading...')) : children}
    </Button>
  );
}

const SPINNER_SIZES: Record<number, string> = { 4: 'size-4', 5: 'size-5', 8: 'h-8 w-8' };
export function Spinner({ size = 5, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-current border-t-transparent text-fg-tertiary',
        SPINNER_SIZES[size],
        className,
      )}
    />
  );
}

export function MiniSelect<T extends string | number>({
  value,
  onChange,
  options,
  width,
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  width: number;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        'bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer',
        className,
      )}
      style={{ width, fontSize: 12, padding: '4px 8px' }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
