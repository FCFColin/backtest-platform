import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { ErrorBanner, EmptyState, LoadingState } from './stateDisplay.js';

export function ResultsShell({
  error,
  isLoading,
  hasResults,
  errorPrefix,
  loadingLabel,
  emptyTitle,
  emptyIcon,
  children,
}: {
  error: string | null | undefined;
  isLoading: boolean;
  hasResults: boolean;
  errorPrefix?: string;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyIcon?: LucideIcon;
  children: ReactNode;
}) {
  if (error) {
    return <ErrorBanner message={errorPrefix ? `${errorPrefix}${error}` : error} variant="error" />;
  }
  if (isLoading && !hasResults) {
    return <LoadingState label={loadingLabel} />;
  }
  if (!hasResults) {
    return emptyTitle ? <EmptyState icon={emptyIcon} title={emptyTitle} /> : null;
  }
  return <>{children}</>;
}
