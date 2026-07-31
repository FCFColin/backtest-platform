import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
interface ChartEmptyStateProps {
  message?: string;
  height?: string;
}
export function ChartEmptyState({ message, height = '280px' }: ChartEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center border border-dashed border-border-subtle rounded-lg" style={{ height }} data-testid="chart-empty-state">
      <div className="text-center text-fg-tertiary">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-caption">{message ?? t('chart.emptyData')}</p>
      </div>
    </div>
  );
}
