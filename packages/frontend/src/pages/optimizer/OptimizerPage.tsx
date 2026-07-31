import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { OptimizerParams } from './OptimizerParams.js';
import { OptimizerResults } from './OptimizerResults.js';
import { useOptimizerState } from './OptimizerUtils.js';
import type { EfficientFrontierState } from './OptimizerUtils.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
function OptimizerParamsWrapper({ state }: { state: EfficientFrontierState }) {
  return <OptimizerParams s={state} />;
}
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
export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return <ComputeToolShell config={config} state={s} />;
}
