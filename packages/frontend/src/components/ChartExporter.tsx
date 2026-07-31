import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/uiComponents';
import { downloadCSV } from '@/utils/download';
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
      {label ?? t('components.chartExporter.defaultLabel')}
    </Button>
  );
}
