/**
 * @file 蒙特卡洛模拟页面
 * @description 基于历史收益分布进行蒙特卡洛模拟，展示未来净值区间、成功率及分布统计
 * @route /monte-carlo
 */
import { useMonteCarloState, McParamsPanel } from './MonteCarloParams.js';
import { MonteCarloResultsPanel } from './MonteCarloResults.js';
import { buildPresets, PresetsCard, MonteCarloSeoCard } from './MonteCarloPresets.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';

export default function MonteCarloPage() {
  const s = useMonteCarloState();
  const presets = buildPresets(s);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">蒙特卡洛模拟</h1>
      </div>
      <MonteCarloSeoCard />
      <PresetsCard presets={presets} />
      <ToolPageLayout
        title="参数设置"
        params={<McParamsPanel s={s} />}
        results={
          <MonteCarloResultsPanel
            error={s.error}
            results1={s.results1}
            results2={s.results2}
            portfolios={s.portfolios}
            portfolioMode={s.portfolioMode}
            activeTab={s.activeTab}
            setActiveTab={s.setActiveTab}
            startingValue={s.startingValue}
            numSimulations={s.numSimulations}
            distMetric={s.distMetric}
            setDistMetric={s.setDistMetric}
          />
        }
      />
    </div>
  );
}
