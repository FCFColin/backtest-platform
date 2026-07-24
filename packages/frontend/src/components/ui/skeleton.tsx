import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder for loading states.
 * @param props - Div props including className.
 * @returns The rendered skeleton element.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-input-bg', className)} {...props} />;
}

export { Skeleton };
