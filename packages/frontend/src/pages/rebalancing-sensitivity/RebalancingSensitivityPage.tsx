import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import { useRebalancingState } from './rebalancingSensitivityUtils.js';
import { RebalancingSensitivityParamsForm } from './RebalancingSensitivityParamsForm.js';
import { ResultsPanel } from './ResultsPanel.js';
type RebalancingState = ReturnType<typeof useRebalancingState>;
const config: ComputeToolConfig<RebalancingState> = {
  titleKey: 'rebalancingSensitivity.title',
  seoDescKey: 'rebalancingSensitivity.seo.desc',
  seoFeatures: [
    { titleKey: 'rebalancingSensitivity.seo.analyzableTitle', descKey: 'rebalancingSensitivity.seo.analyzableDesc' },
    { titleKey: 'rebalancingSensitivity.seo.offsetScanTitle', descKey: 'rebalancingSensitivity.seo.offsetScanDesc' }
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.lumpsumVsDca', href: '/lumpsum-vs-dca' }
  ],
  paramsTitleKey: 'rebalancingSensitivity.params.title',
  params: ({ state }) => <RebalancingSensitivityParamsForm s={state} />,
  results: ({ state }) => <ResultsPanel s={state} />
};
export default function RebalancingSensitivityPage() {
  const s = useRebalancingState();
  return <ComputeToolShell config={config} state={s} />;
}
