import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
interface StatusErrorPageProps {
  statusCode: number;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}
export function StatusErrorPage({ statusCode, icon: Icon, title, description, action }: StatusErrorPageProps) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-12">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-danger/10 text-danger">
          <Icon className="size-8" />
        </div>
        <div className="text-h1 font-semibold text-fg-tertiary">{statusCode}</div>
        <h1 className="text-h2 font-semibold text-fg">{title}</h1>
        <p className="text-body text-fg-secondary">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </Card>
    </div>
  );
}
export default StatusErrorPage;
