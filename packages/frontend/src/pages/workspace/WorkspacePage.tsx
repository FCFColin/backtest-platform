/**
 * @file My Workspace 页面
 * @description P3-1: 登录用户的工作区，展示已保存的标的/组合/策略/运行历史。
 *   6 个 Tab: My Tickers / My Portfolios / My Strategies / My Saved Runs / Email Alerts / My Metrics
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

export default function WorkspacePage() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('workspace.title')}</h1>
      <Card className="p-6">
        <p className="text-body text-fg-secondary">{t('workspace.description')}</p>
      </Card>
    </div>
  );
}
