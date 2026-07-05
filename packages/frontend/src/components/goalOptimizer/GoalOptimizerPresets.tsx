import { Link } from 'react-router-dom';

export function GoalOptimizerSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        目标优化器基于历史收益分布进行蒙特卡洛模拟，计算您达成财务目标的概率，并给出建议的资产配置与定期投入方案。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            设定目标金额、初始资金与时间范围，基于资产配置的历史收益特征模拟数千条未来路径。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">输出结果</div>
          <div className="bt-seo-feature-desc">
            达成目标的成功概率、终值概率分布曲线、中位数/P10/P90 最优路径、预期收益与所需定期投入。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛模拟
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
