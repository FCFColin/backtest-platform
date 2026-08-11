import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { ErrorBanner, EmptyState, LoadingState } from './stateDisplay.js';
import { Button } from './ui/uiComponents.js';
import { useTranslation } from 'react-i18next';

export function ResultsShell({
  error,
  isLoading,
  hasResults,
  errorPrefix,
  loadingLabel,
  emptyTitle,
  emptyIcon,
  onRetry,
  children,
}: {
  error: string | null | undefined;
  isLoading: boolean;
  hasResults: boolean;
  errorPrefix?: string;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyIcon?: LucideIcon;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <ErrorBanner
          message={errorPrefix ? `${errorPrefix}${error}` : error}
          variant="error"
          className="max-w-[520px]"
        />
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {t('Retry')}
          </Button>
        )}
      </div>
    );
  }
  if (isLoading && !hasResults) {
    return <LoadingState label={loadingLabel} />;
  }
  if (!hasResults) {
    return emptyTitle ? <EmptyState icon={emptyIcon} title={emptyTitle} /> : null;
  }
  return <>{children}</>;
}
