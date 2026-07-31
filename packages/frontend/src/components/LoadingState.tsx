import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      <LoadingSpinner size={size} className="mb-4" />
      {label && <p className="text-body text-fg-secondary">{label}</p>}
    </div>
  );
}
