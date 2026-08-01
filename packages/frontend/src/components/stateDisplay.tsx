import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
    >
      {Icon && <Icon className="size-12 text-fg-tertiary mb-4" />}
      <h2 className="text-h2 text-fg">{title}</h2>
      {description && <p className="text-body text-fg-secondary mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}
export function LoadingSpinner({ size = 24, className }: LoadingSpinnerProps) {
  return <Loader2 size={size} className={cn('animate-spin text-fg-tertiary', className)} />;
}
interface LoadingStateProps {
  label?: ReactNode;
  size?: number;
  className?: string;
}
export function LoadingState({ label, size = 32, className }: LoadingStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
    >
      <LoadingSpinner size={size} className="mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </div>
  );
}
