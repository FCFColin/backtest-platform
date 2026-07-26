/**
 * @file Portfolio Comparison 独立工具
 * @description P2-2: 跨时期/跨货币/跨预设的对比矩阵。
 *   复用 /api/v1/backtest/portfolio 引擎，前端聚合结果。
 *   展示：雷达图 + 分组柱状图 + 差异矩阵。
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

/**
 * Portfolio Comparison 页面组件。
 * @returns 渲染的对比矩阵页面。
 */
export default function PortfolioComparisonPage() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('portfolioComparison.title')}</h1>
      <Card className="p-6">
        <p className="text-body text-fg-secondary">{t('portfolioComparison.description')}</p>
      </Card>
    </div>
  );
}
