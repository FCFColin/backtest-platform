/**
 * @file 蒙特卡洛模拟页面
 * @description 基于历史收益分布进行蒙特卡洛模拟，展示未来净值区间、成功率及分布统计
 * @route /monte-carlo
 */
import { Link } from 'react-router-dom';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { useMonteCarloState } from '../components/monteCarlo/useMonteCarloState.js';
import { McParamsPanel } from '../components/monteCarlo/params/McParamsPanel.js';
import { MonteCarloResultsPanel } from '../components/monteCarlo/results/McResultsPanel.js';
import { buildPresets, PresetsCard } from '../components/monteCarlo/presets/PresetsCard.js';

function MonteCarloSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">本工具使用区块自举法对历史市场数据进行重采样，让您研究大量可能的组合路径，而非仅回放一段固定历史。</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可模拟内容</div>
          <div className="bt-seo-feature-desc">退休提款策略、定投计划、固定提取方案，观察其在数千条模拟市场路径下的表现与存活概率。</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">输出结果</div>
          <div className="bt-seo-feature-desc">分布统计表(Summary)、组合价值范围图、成功概率曲线、多指标分布直方图、代表性场景路径。</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>有效前沿</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>资产分析</Link>
      </div>
    </div>
  );
}

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
