import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileQuestion, LogIn, ShieldX, Gauge, ServerCrash, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents';
import { StatusErrorPage } from '@/components/errors/StatusErrorPage';
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
