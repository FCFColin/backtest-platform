import { useRebalancingState } from './rebalancingSensitivityUtils.js';
import { RebalancingSensitivityParamsForm } from './RebalancingSensitivityParamsForm.js';
import { ResultsPanel } from './ResultsPanel.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import type { RebalancingState } from './rebalancingSensitivityUtils.js';

function ParamsWrapper({ state }: { state: RebalancingState }) {
  return <RebalancingSensitivityParamsForm s={state} />;
}

function ResultsWrapper({ state }: { state: RebalancingState }) {
  return <ResultsPanel s={state} />;
}

const config: ComputeToolConfig<RebalancingState> = {
  titleKey: 'rebalancingSensitivity.title',
  seoDescKey: 'rebalancingSensitivity.seo.desc',
  seoFeatures: [
    {
      titleKey: 'rebalancingSensitivity.seo.analyzableTitle',
      descKey: 'rebalancingSensitivity.seo.analyzableDesc',
    },
    {
      titleKey: 'rebalancingSensitivity.seo.offsetScanTitle',
      descKey: 'rebalancingSensitivity.seo.offsetScanDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.lumpsumVsDca', href: '/lumpsum-vs-dca' },
  ],
  params: ParamsWrapper,
  results: ResultsWrapper,
};

export default function RebalancingSensitivityPage() {
  const s = useRebalancingState();
  return <ComputeToolShell config={config} state={s} />;
}
