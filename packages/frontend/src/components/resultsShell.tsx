import { type ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErrorBanner, EmptyState, LoadingState } from './stateDisplay.js';
interface AnalysisErrorAlertProps {
  error: string | null | undefined;
  prefix?: ReactNode;
  className?: string;
  children?: (error: string) => ReactNode;
}
export function AnalysisErrorAlert({
  error,
  prefix,
  className,
  children,
}: AnalysisErrorAlertProps) {
  if (!error) return null;
  return (
    <Card className={cn('flex items-center justify-center gap-2 p-6 text-center', className)}>
      <AlertCircle className="size-5 shrink-0 text-danger" />
      <div className="text-body text-danger">
        {children ? (
          children(error)
        ) : (
          <>
            {prefix}
            {error}
          </>
        )}
      </div>
    </Card>
  );
}
interface EmptyResultsHintProps {
  text?: ReactNode;
  className?: string;
}
export function EmptyResultsHint({ text, className }: EmptyResultsHintProps) {
  return (
    <Card
      className={cn(
        'flex items-center justify-center p-12 text-center text-body text-fg-tertiary',
        className,
      )}
    >
      {text}
    </Card>
  );
}

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
