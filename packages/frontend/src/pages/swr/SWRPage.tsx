/**
 * @file SWR (Safe Withdrawal Rate) 独立工具
 * @description P2-3: 独立页面 /swr，功能对齐 testfol.io。
 *   组合权重设置 + 提款策略 + 起止年龄 + 成功率 + 终值分布 + 最坏路径。
 *   引擎复用 engine-go/internal/engine/statistics_withdrawal.go。
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

export default function SWRPage() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('swr.title')}</h1>
      <Card className="p-6">
        <p className="text-body text-fg-secondary">{t('swr.description')}</p>
      </Card>
    </div>
  );
}
