/* eslint-disable @typescript-eslint/no-explicit-any */
import { TacticalParamsPanel } from './TacticalParams.js';
import { TacticalResultsPanel } from './TacticalResults.js';
import { useTacticalPageState } from './TacticalUtils.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

function TacticalParamsWrapper({ state }: { state: any }) {
  return <TacticalParamsPanel state={state} />;
}

function TacticalResultsWrapper({ state }: { state: any }) {
  return <TacticalResultsPanel state={state} />;
}

const config: ComputeToolConfig<any> = {
  titleKey: 'tactical.title',
  seoDescKey: 'tactical.seo.desc',
  seoFeatures: [
    { titleKey: 'tactical.seo.configurableTitle', descKey: 'tactical.seo.configurableDesc' },
    { titleKey: 'tactical.seo.viewableTitle', descKey: 'tactical.seo.viewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
  ],
  params: TacticalParamsWrapper,
  results: TacticalResultsWrapper,
};

export default function TacticalPage() {
  const s = useTacticalPageState();
  return <ComputeToolShell config={config} state={s} />;
}
