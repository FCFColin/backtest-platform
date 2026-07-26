/**
 * @file Time Value of Money 多维扫描器
 * @description P2-4: 3 变量扫描（X/Y/Color），生成热力图。
 *   输入: 起始金额/每期投入/频率/结束时机。
 *   输出: 3D 热力图 + 表格 + 单点详情。
 *   后端复用现有 CAGR 计算器。
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

export default function TVMScannerPage() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('tvmScanner.title')}</h1>
      <Card className="p-6">
        <p className="text-body text-fg-secondary">{t('tvmScanner.description')}</p>
      </Card>
    </div>
  );
}
