import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents';
export default function MCOptimizerPage() {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('mcOptimizer.title')}</h1>
      <Card className="p-6">
        <p className="text-body text-fg-secondary">{t('mcOptimizer.description')}</p>
      </Card>
    </div>
  );
}
