/**
 * @file 优化器（Efficient Frontier Optimizer）页面入口
 * @description 通过 ComputeToolShell（内部包 ToolPageLayout）渲染参数面板与结果面板。
 *   工具级 SEO 描述与相关工具链接由 config 声明，hideParamsTitle 让参数卡片保持 testfol.io 风格的极简外观。
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { OptimizerParams } from './OptimizerParams.js';
import { OptimizerResults } from './OptimizerResults.js';
import { useOptimizerState } from './OptimizerUtils.js';
import type { EfficientFrontierState } from './OptimizerUtils.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

/** 参数面板适配器：将 ComputeToolShell 的 { state } prop 透传为 OptimizerParams 的 { s }。 */
function OptimizerParamsWrapper({ state }: { state: EfficientFrontierState }) {
  return <OptimizerParams s={state} />;
}

/** 结果面板适配器：将 ComputeToolShell 的 { state } prop 透传为 OptimizerResults 的 { s }。 */
function OptimizerResultsWrapper({ state }: { state: EfficientFrontierState }) {
  return <OptimizerResults s={state} />;
}

const config: ComputeToolConfig<EfficientFrontierState> = {
  titleKey: 'optimizer.title',
  seoDescKey: 'optimizer.seoDesc',
  seoFeatures: [
    { titleKey: 'optimizer.seoObjective', descKey: 'optimizer.seoObjectiveDesc' },
    { titleKey: 'optimizer.seoOutput', descKey: 'optimizer.seoOutputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
  ],
  hideParamsTitle: true,
  params: OptimizerParamsWrapper,
  results: OptimizerResultsWrapper,
};

/** 优化器页面：组装状态并交给 ComputeToolShell 渲染。 */
export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return <ComputeToolShell config={config} state={s} />;
}
