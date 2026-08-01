import { type ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
import { AlertCircle } from 'lucide-react';
import { ErrorBanner } from './stateDisplay.js';
import type { WarningInfo } from '../utils/errorReporter.js';
import type { DateRangeInfo } from '../store/types.js';
import { cn } from '@/lib/utils';
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
interface WarningBannersProps {
  warnings: WarningInfo[];
  dateRange: DateRangeInfo | null;
}
export function WarningBanners({ warnings, dateRange }: WarningBannersProps) {
  const banners: ReactNode[] = [];
  if (dateRange?.clamped) {
    banners.push(
      <ErrorBanner
        key="date-clamped"
        warning={{
          code: 'DATE_RANGE_CLAMPED',
          requestedStart: dateRange.requested.start,
          requestedEnd: dateRange.requested.end,
          actualStart: dateRange.actual.start,
          actualEnd: dateRange.actual.end,
        }}
        variant="info"
      />,
    );
  }
  if (dateRange?.missingTickers && dateRange.missingTickers.length > 0) {
    banners.push(
      <ErrorBanner
        key="missing-tickers"
        warning={{ code: 'TICKER_NOT_FOUND', tickers: dateRange.missingTickers }}
        variant="warning"
      />,
    );
  }
  warnings.forEach((w, idx) => {
    if (w.code === 'DATE_RANGE_CLAMPED' || w.code === 'TICKER_NOT_FOUND') return;
    banners.push(<ErrorBanner key={w.code || `warn-${idx}`} warning={w} variant="warning" />);
  });
  return <>{banners}</>;
}
