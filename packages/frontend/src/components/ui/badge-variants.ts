import { cva } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
  {
    variants: {
      variant: {
        asset: 'bg-brand/10 border-brand/20 text-brand hover:bg-brand/15',
        'factor-active': 'bg-brand/15 border-brand/40 text-brand',
        'factor-inactive':
          'bg-input-bg border-border text-fg-secondary hover:text-fg hover:border-border-strong cursor-pointer',
        preset:
          'bg-input-bg border-border text-fg-secondary hover:text-fg hover:border-border-strong cursor-pointer',
        secondary:
          'bg-input-bg border-border text-fg-secondary hover:text-fg hover:border-border-strong',
        outline: 'border-border text-fg-tertiary bg-transparent uppercase tracking-wider',
        success: 'bg-success/10 border-success/20 text-success',
        danger: 'bg-danger/10 border-danger/20 text-danger',
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        default: 'h-7 px-3 text-caption',
        lg: 'h-9 px-4 text-label',
      },
    },
    defaultVariants: { variant: 'asset', size: 'default' },
  },
);

export { badgeVariants };
