import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import i18n from '@/i18n/index.js';
import { OptimizerParams } from './OptimizerParams.js';
import { OptimizerResults } from './OptimizerResults.js';
import { useOptimizerState } from './OptimizerUtils.js';
import type { EfficientFrontierState } from './OptimizerUtils.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
const PRESETS = [
  ['optimizer.presets.equityBond6040', ['VTI', 'BND'], 'maxSharpe', 5, 95],
  ['optimizer.presets.threeFund', ['VTI', 'VXUS', 'BND'], 'maxSharpe'],
  ['optimizer.presets.minVolatility', ['VTI', 'VXUS', 'BND', 'QQQ'], 'minVolatility'],
] as const;
const config: ComputeToolConfig<EfficientFrontierState> = {
  titleKey: 'nav.portfolioOptimize',
  seoDescKey: 'optimizer.seoDesc',
  seoFeatures: [
    { titleKey: 'Objective', descKey: 'optimizer.seoObjectiveDesc' },
    { titleKey: 'goalOptimizer.seo.outputTitle', descKey: 'optimizer.seoOutputDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.efficientF, TOOL_LINKS.analysis, TOOL_LINKS.monteCarlo],
  hideParamsTitle: true,
  presets: (s: EfficientFrontierState) => PRESETS.map(([k, t, o, mn = 0, mx = 100]) => ({ label: i18n.t(k), onClick: () => (s.setTickers([...t]), s.setObjective(o as never), s.setMinWeight(mn), s.setMaxWeight(mx)) })),
  params: ({ state }: { state: EfficientFrontierState }) => <OptimizerParams s={state} />,
  results: ({ state }: { state: EfficientFrontierState }) => <OptimizerResults s={state} />,
};
export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return <ComputeToolShell config={config} state={s} />;
}
