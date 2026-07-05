import { Link } from 'react-router-dom';

function FrontierSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        有效前沿工具帮助您从单一"最优"组合扩展到完整的历史测试组合图谱。它生成一系列在收益与风险之间权衡的组合。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可视化</div>
          <div className="bt-seo-feature-desc">
            以散点图展示风险-收益权衡，按夏普比率从红到绿渐变着色，标注最大夏普比率组合，点击查看权重详情。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">约束条件</div>
          <div className="bt-seo-feature-desc">
            支持调仓频率、现金分配、收益/风险目标、求解器选择、最小包含权重等约束设置。
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
          组合优化
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛模拟
        </Link>
      </div>
    </div>
  );
}

export default FrontierSeoCard;
export { FrontierSeoCard };
