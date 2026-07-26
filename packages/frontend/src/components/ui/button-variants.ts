import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-lg font-medium',
    'transition-colors duration-150 ease-out-quart',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app',
    'disabled:pointer-events-none',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        // Primary：本页最核心 CTA，全站每页最多 1 个
        primary: [
          'bg-brand text-brand-fg',
          'hover:bg-brand-hover active:bg-brand-active',
          'active:scale-[0.98] transition-transform',
          'disabled:bg-brand/30 disabled:text-brand-fg/50',
        ],
        // Secondary：辅助操作（加载、添加、切换）
        secondary: [
          'bg-input-bg text-fg-secondary border border-border',
          'hover:bg-hover hover:text-fg hover:border-border-strong',
          'active:scale-[0.98] transition-transform',
          'disabled:opacity-40',
        ],
        // Ghost：文字按钮（加载示例、关于）
        ghost: [
          'bg-transparent text-brand hover:text-brand-hover',
          'hover:bg-brand/10',
          'disabled:opacity-40',
        ],
        // Outline：中性 outline（很少用，仅 dialog 里 Cancel）
        outline: [
          'border border-border bg-transparent text-fg',
          'hover:bg-hover hover:border-border-strong',
        ],
        // Destructive：删除
        destructive: [
          'bg-transparent text-fg-tertiary',
          'hover:bg-danger/10 hover:text-danger',
          'active:scale-[0.98] transition-transform',
        ],
        // Icon：纯图标按钮
        icon: ['bg-transparent text-fg-tertiary', 'hover:bg-hover hover:text-fg', 'rounded-md'],
      },
      size: {
        sm: 'h-8 px-3 text-caption [&_svg]:size-3.5',
        default: 'h-9 px-4 text-body [&_svg]:size-4',
        lg: 'h-11 px-6 text-body font-semibold [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export { buttonVariants };
