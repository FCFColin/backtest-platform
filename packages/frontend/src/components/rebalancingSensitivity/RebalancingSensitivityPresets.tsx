import { Link } from 'react-router-dom';

export function RebalancingSensitivityPresets() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        对比不同调仓频率对同一投资组合长期表现的影响。选择多种调仓频率并行回测，直观查看
        CAGR、波动率、最大回撤、夏普比率和 Sortino 比率的差异。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            每日/每周/每月/每季度/每年调仓对组合收益与风险的影响，支持偏离带扫描。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">偏移扫描</div>
          <div className="bt-seo-feature-desc">
            在选定频率下扫描不同偏移天数（0-20天），观察调仓时点对收益的影响。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化器
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/lumpsum-vs-dca" className="link-blue" style={{ fontWeight: 700 }}>
          一次性 vs 定投
        </Link>
      </div>
    </div>
  );
}
