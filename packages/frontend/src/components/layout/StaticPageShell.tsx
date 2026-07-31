import type { ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
interface StaticPageShellProps {
  title: string;
  cardClassName?: string;
  titleClassName?: string;
  children: ReactNode;
}
export function StaticPageShell({
  title,
  cardClassName = 'p-6',
  titleClassName = 'text-display',
  children,
}: StaticPageShellProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className={`${titleClassName} text-fg`}>{title}</h1>
      <Card className={cardClassName}>{children}</Card>
    </div>
  );
}
