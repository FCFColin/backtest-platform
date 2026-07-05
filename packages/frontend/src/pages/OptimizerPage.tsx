/**
 * @file 组合优化器页面
 * @description 基于 Markowitz 或遗传算法求解最优投资组合权重，支持最大夏普、最小波动等目标
 * @route /optimizer
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOptimizerState } from '../hooks/useOptimizerState.js';
import { OptimizerParams } from '../components/optimizer/OptimizerParams.js';
import { OptimizerResults } from '../components/optimizer/OptimizerResults.js';
import { OptimizerSeoCard } from '../components/optimizer/OptimizerPresets.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';

export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('optimizer.title')}</h1>
      </div>
      <OptimizerSeoCard />
      <ToolPageLayout
        title={t('params.title')}
        params={<OptimizerParams s={s} />}
        results={<OptimizerResults s={s} />}
      />
    </div>
  );
}
