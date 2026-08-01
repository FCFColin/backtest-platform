import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileQuestion, LogIn, ShieldX, Gauge, ServerCrash, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Card } from '@/components/ui/uiComponents';
import { StaticPageShell } from '@/components/layout/StaticPageShell.js';
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
      title={t('errors.404.title')}
      description={t('errors.404.description')}
      action={
        <Button asChild variant="primary">
          <Link to="/">{t('common.goHome')}</Link>
        </Button>
      }
    />
  );
}
export function UnauthorizedPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={401}
      icon={LogIn}
      title={t('errors.401.title')}
      description={t('errors.401.description')}
      action={
        <Button asChild variant="primary">
          <Link to="/login">{t('common.signIn')}</Link>
        </Button>
      }
    />
  );
}
export function ForbiddenPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={403}
      icon={ShieldX}
      title={t('errors.403.title')}
      description={t('errors.403.description')}
      action={
        <Button asChild variant="primary">
          <Link to="/">{t('common.goHome')}</Link>
        </Button>
      }
    />
  );
}
interface RetryPageProps {
  retryAfter?: number;
}
export function TooManyRequestsPage({ retryAfter }: RetryPageProps): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={429}
      icon={Gauge}
      title={t('errors.429.title')}
      description={t('errors.429.description', { seconds: retryAfter ?? 0 })}
      action={
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('common.retry')}
        </Button>
      }
    />
  );
}
export function InternalServerErrorPage(): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={500}
      icon={ServerCrash}
      title={t('errors.500.title')}
      description={t('errors.500.description')}
      action={
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('common.reload')}
        </Button>
      }
    />
  );
}
export function ServiceUnavailablePage({ retryAfter }: RetryPageProps): ReactNode {
  const { t } = useTranslation();
  return (
    <StatusErrorPage
      statusCode={503}
      icon={Wrench}
      title={t('errors.503.title')}
      description={t('errors.503.description', { seconds: retryAfter ?? 0 })}
      action={
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('common.retry')}
        </Button>
      }
    />
  );
}
export default NotFoundPage;
