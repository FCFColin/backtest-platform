import { Link } from 'react-router-dom';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { useTacticalPageState } from './TacticalUtils.js';
import { TacticalParamsPanel } from './TacticalParams.js';
import { TacticalResultsPanel } from './TacticalResults.js';

function TacticalSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        战术分配工具基于技术指标（SMA/EMA/RSI/MACD/布林带/动量）构建交易信号，
        支持多信号聚合（投票/加权平均/排名）生成动态权重切换策略，运行历史回测并与等权基准对比，
        同时提供 What-If 实时信号查询与邮件告警配置。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可配置内容</div>
          <div className="bt-seo-feature-desc">
            技术指标参数、信号触发条件、目标权重、聚合方式、再平衡频率。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可查看结果</div>
          <div className="bt-seo-feature-desc">
            收益曲线、统计指标、信号切换历史、实时价格与信号状态。
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

export default function TacticalPage() {
  const state = useTacticalPageState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">战术分配</h1>
      </div>
      <TacticalSeoCard />
      <ToolPageLayout
        title="战术策略参数"
        params={<TacticalParamsPanel state={state} />}
        results={<TacticalResultsPanel state={state} />}
      />
    </div>
  );
}
