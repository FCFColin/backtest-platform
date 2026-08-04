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
export function ChartExporter({ data, filename = 'chart-data', label }: ChartExporterProps) {
  const { t } = useTranslation();
  const handleExport = () => downloadCSV(data, filename);
  const disabled = data.length === 0;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleExport} disabled={disabled}>
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
  if (!hasTitle) {
    return (
      <Card className={className} style={style}>
        <CardContent className="p-4 pt-4">{children}</CardContent>
      </Card>
    );
  }
  return (
    <Card className={className} style={style}>
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pt-4 pb-3">
        <div className="text-h3 font-semibold text-fg">{title}</div>
        {hasRightContent && (
          <div className="flex items-center gap-2">
            {hasHeaderExtra && headerExtra}
            {showExporter && <ChartExporter data={data} filename={csvFilename} />}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}
