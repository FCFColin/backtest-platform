import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Card } from '@/components/ui/uiComponents';
import { StaticPageShell } from '@/components/layout/ToolPageLayout.js';
interface StatusErrorPageProps {
  statusCode: number;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}
function StatusErrorPage({
  statusCode,
  icon: Icon,
  title,
  description,
  action,
}: StatusErrorPageProps) {
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
export function PlaceholderPage({ titleKey, descKey }: { titleKey: string; descKey: string }) {
  const { t } = useTranslation();
  return (
    <StaticPageShell title={t(titleKey)} titleClassName="text-h1">
      <p className="text-body text-fg-secondary">{t(descKey)}</p>
    </StaticPageShell>
  );
}
function NotFoundPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={404}
      icon={FileQuestion}
      title={t('Page Not Found')}
      description={t('The page you are looking for does not exist or has been moved.')}
      action={
        <Button asChild variant="primary">
          <Link to="/">{t('Go home')}</Link>
        </Button>
      }
    />
  );
}
export default NotFoundPage;
