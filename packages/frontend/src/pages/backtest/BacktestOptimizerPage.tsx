import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import { useOptimizerState } from './backtestOptimizerUtils.js';
import type { BacktestOptimizerState } from './backtestOptimizerUtils.js';
import { OptimizerParams, OptimizerResults } from './backtestOptimizerComponents.js';
const config: ComputeToolConfig<BacktestOptimizerState> = {
  titleKey: 'backtest.optimizer.pageTitle',
  seoDescKey: 'backtest.optimizer.seoDesc',
  seoFeatures: [
    {
      titleKey: 'backtest.optimizer.featureParamSpaceTitle',
      descKey: 'backtest.optimizer.featureParamSpaceDesc',
    },
    {
      titleKey: 'backtest.optimizer.featureMultiObjectiveTitle',
      descKey: 'backtest.optimizer.featureMultiObjectiveDesc',
    },
  ],
  paramsTitleKey: 'backtest.optimizer.paramSettings',
  params: ({ state }) => <OptimizerParams s={state} />,
  results: ({ state }) => <OptimizerResults s={state} />,
};
export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return <ComputeToolShell config={config} state={s} />;
}
