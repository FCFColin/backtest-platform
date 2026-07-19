/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { OptimizerParams } from './OptimizerParams.js';
import { OptimizerResults } from './OptimizerResults.js';
import { useOptimizerState } from './OptimizerUtils.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

function OptimizerParamsWrapper({ state }: { state: any }) {
  return <OptimizerParams s={state} />;
}

function OptimizerResultsWrapper({ state }: { state: any }) {
  return <OptimizerResults s={state} />;
}

const config: ComputeToolConfig<any> = {
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
  params: OptimizerParamsWrapper,
  results: OptimizerResultsWrapper,
};

export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return <ComputeToolShell config={config} state={s} />;
}
