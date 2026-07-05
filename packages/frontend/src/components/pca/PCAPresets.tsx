import { Link } from 'react-router-dom';

export default function PCASeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        主成分分析（PCA）工具对多个资产的日收益率进行降维分析，提取主要驱动因子，帮助您理解资产组合的风险结构与共同变动来源。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            特征值、累计方差解释率、载荷矩阵（各资产对主成分的贡献）、主成分得分。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">适用场景</div>
          <div className="bt-seo-feature-desc">
            识别资产组合的主要风险因子、降维可视化、构建因子模型与组合分散化分析。
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
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
      </div>
    </div>
  );
}
