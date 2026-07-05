import { Link } from 'react-router-dom';

export function CalculatorsSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        投资计算器工具集，涵盖CAGR估算、终值计算、杠杆ETF衰减分析、安全提款率估算和资产配置风险评估。
        所有计算均在浏览器端完成，无需后端支持，可快速验证投资假设与参数敏感性。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">基础计算</div>
          <div className="bt-seo-feature-desc">
            CAGR估算器、终值计算器（含定投），快速验证投资增长假设。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">杠杆与风险</div>
          <div className="bt-seo-feature-desc">
            杠杆ETF衰减估算、安全提款率(SWR)、资产配置风险，评估杠杆与退休规划。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">高级工具</div>
          <div className="bt-seo-feature-desc">
            Kelly最优杠杆、两基金组合前沿、期权杠杆，对标testfol.io Calculator Suite。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          有效前沿
        </Link>
      </div>
    </div>
  );
}
