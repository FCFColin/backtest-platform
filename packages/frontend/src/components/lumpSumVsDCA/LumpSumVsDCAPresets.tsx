import { Link } from 'react-router-dom';

export function LumpSumVsDCAPresets() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        对比一次性投入与定期定额投资（DCA）在同一组合上的表现差异。一次性投资在期初全额投入，
        定投则将资金分批投入，观察两种策略在不同市场环境下的终值与风险特征。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            一次性投入 vs 按月/按季度定投的增长曲线、终值、CAGR、波动率、最大回撤、夏普比率等。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">策略说明</div>
          <div className="bt-seo-feature-desc">
            定投将初始资金均分为若干期，每期等额投入；未投入资金可选择投入短期国债（T-Bill）获取无风险收益。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/rebalancing-sensitivity" className="link-blue" style={{ fontWeight: 700 }}>
          调仓敏感性
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛
        </Link>
      </div>
    </div>
  );
}
