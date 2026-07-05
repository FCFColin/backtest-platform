import { Link } from 'react-router-dom';

function FactorRegressionSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        使用 Fama-French 三因子模型（MKT-RF、SMB、HML）对投资组合进行回归分析，
        分解组合收益来源，计算 Alpha、Beta、规模因子和价值因子载荷，以及 R² 和残差。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            组合超额收益中来自市场、规模、价值因子的贡献比例，以及经理的 Alpha 能力。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">因子说明</div>
          <div className="bt-seo-feature-desc">
            MKT-RF：市场超额收益；SMB：小盘股减大盘股；HML：价值股减成长股。数据来源于 Kenneth
            French 数据库。
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
        <Link to="/rebalancing-sensitivity" className="link-blue" style={{ fontWeight: 700 }}>
          调仓敏感性
        </Link>
      </div>
    </div>
  );
}

export default FactorRegressionSeoCard;
export { FactorRegressionSeoCard };
