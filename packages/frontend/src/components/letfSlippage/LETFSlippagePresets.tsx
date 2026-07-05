import { Link } from 'react-router-dom';

export function LETFSlippagePresets() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        杠杆 ETF（LETF）滑点分析工具，量化杠杆 ETF
        相对基准指数的预期收益与实际收益之间的偏差，揭示长期持有杠杆 ETF 的衰减拖累。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            每日/累积滑点曲线、年化拖累、实际杠杆 vs 名义杠杆、基准与 LETF 收益对比。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">适用场景</div>
          <div className="bt-seo-feature-desc">
            评估杠杆 ETF 长期持有的衰减成本、验证杠杆复利偏差、对比不同 LETF 的跟踪效率。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/pca" className="link-blue" style={{ fontWeight: 700 }}>
          主成分分析
        </Link>
      </div>
    </div>
  );
}
