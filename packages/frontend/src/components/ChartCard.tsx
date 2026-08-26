import type { CSSProperties, ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, Button } from '@/components/ui/uiComponents';
import { downloadCSV } from '@/utils/format';
interface ChartExporterProps {
  data: Array<Record<string, string | number>>;
  filename?: string;
  label?: string;
}
function ChartExporter({
  data,
  filename = 'chart-data',
  label,
  title,
}: ChartExporterProps & { title?: ReactNode }) {
  const { t } = useTranslation();
  const handleExport = () => downloadCSV(data, filename);
  const disabled = data.length === 0;
  const ariaLabel =
    typeof title === 'string'
      ? t('Download {{title}} CSV', { title })
      : (label ?? t('Download chart CSV'));
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleExport}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <Download />
      {label ?? t('Chart')}
    </Button>
  );
}
interface ChartCardProps {
  title?: ReactNode;
  data?: Array<Record<string, string | number>>;
  csvFilename?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}
export default function ChartCard({
  title,
  data,
  csvFilename,
  headerExtra,
  children,
  style,
  className,
}: ChartCardProps) {
  const hasTitle = title != null;
  const showExporter = data !== undefined && csvFilename !== undefined;
  const hasHeaderExtra = headerExtra != null;
  const hasRightContent = showExporter || hasHeaderExtra;
  return (
    <Card className={className} style={style}>
      {hasTitle && (
        <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pt-4 pb-3">
          <div className="text-h3 font-semibold text-fg">{title}</div>
          {hasRightContent && (
            <div className="flex items-center gap-2">
              {hasHeaderExtra && headerExtra}
              {showExporter && <ChartExporter data={data} filename={csvFilename} title={title} />}
            </div>
          )}
        </CardHeader>
      )}
      <CardContent className={hasTitle ? 'px-4 pb-4 pt-0' : 'p-4 pt-4'}>{children}</CardContent>
    </Card>
  );
}
