/**
 * @file Monte Carlo Optimizer 前端页面
 * @description P2-5: 在蒙特卡洛路径下寻找最优权重。
 *   引擎: engine-go/internal/montecarlo/optimizer.go
 *   输入: 资产池 + 目标（最大化中位 CAGR / 最小化 5% 分位回撤）
 *   输出: 最优权重 + 目标值分布
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

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
