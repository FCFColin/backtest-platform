/**
 * @file 帮助/方法论页面
 * @description 回测计算方法、指标定义、数据来源说明、常见问题 FAQ
 * @route /help
 */
import { useState } from 'react';
import { BookOpen, Database, HelpCircle, ChevronDown, Calculator, TrendingUp } from 'lucide-react';

type Section = 'methodology' | 'data' | 'faq';

export default function HelpPage() {
  const [section, setSection] = useState<Section>('methodology');

  const tabs: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'methodology', label: '计算方法论', icon: <Calculator className="w-4 h-4" /> },
    { key: 'data', label: '数据来源', icon: <Database className="w-4 h-4" /> },
    { key: 'faq', label: '常见问题', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">帮助中心</h1>
      </div>

      <div className="bt-main-card card" style={{ padding: 24 }}>
        {/* Tab 切换 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid var(--border-soft)', paddingBottom: 12 }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                color: section === tab.key ? 'var(--brand)' : 'var(--text-muted)',
                background: section === tab.key ? 'var(--brand-soft)' : 'transparent',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {section === 'methodology' && <MethodologySection />}
        {section === 'data' && <DataSection />}
        {section === 'faq' && <FaqSection />}
      </div>
    </div>
  );
}

function MethodologySection() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <BookOpen className="w-6 h-6" style={{ color: 'var(--brand)' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>回测计算方法论</div>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 20 }}>
        本平台采用时间加权收益率（TWR）进行回测，支持定期调仓与阈值调仓两种模式。
        所有收益率均按对数收益累乘计算，最终换算为各类年化指标。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricCard
          name="CAGR"
          fullName="年化复合增长率"
          formula="CAGR = (V_end / V_start)^(1/years) - 1"
          desc="组合在整个回测期间的年化几何平均收益率，是最核心的长期收益指标。"
        />
        <MetricCard
          name="Sharpe Ratio"
          fullName="夏普比率"
          formula="Sharpe = (R_p - R_f) / σ_p"
          desc="单位总风险下的超额收益。R_f 为无风险利率（默认 0），σ_p 为收益率序列的标准差（年化）。"
        />
        <MetricCard
          name="Sortino Ratio"
          fullName="索提诺比率"
          formula="Sortino = (R_p - R_f) / σ_downside"
          desc="与夏普类似，但仅以下行波动率作为风险度量，对上行波动不惩罚，更符合投资者直觉。"
        />
        <MetricCard
          name="Max Drawdown"
          fullName="最大回撤"
          formula="MDD = min((V_t - max(V_0..t)) / max(V_0..t))"
          desc="从历史最高点到后续最低点的最大跌幅，衡量组合最坏情况下的亏损幅度。"
        />
        <MetricCard
          name="Volatility"
          fullName="年化波动率"
          formula="σ_annual = σ_daily × √252"
          desc="日收益率标准差按 252 个交易日年化，衡量组合收益的波动程度。"
        />
        <MetricCard
          name="Calmar Ratio"
          fullName="卡玛比率"
          formula="Calmar = CAGR / |MDD|"
          desc="单位最大回撤下的年化收益，反映承担回撤风险所获得的回报。"
        />
        <MetricCard
          name="Beta"
          fullName="贝塔系数"
          formula="β = Cov(R_p, R_m) / Var(R_m)"
          desc="组合相对基准指数的系统性风险暴露。β=1 表示与基准同幅波动，β>1 更激进。"
        />
        <MetricCard
          name="Alpha"
          fullName="阿尔法"
          formula="α = R_p - [R_f + β(R_m - R_f)]"
          desc="扣除系统性风险后的超额收益，衡量主动管理能力。"
        />
      </div>

      <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)', fontSize: 13, color: 'var(--text-body)' }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-strong)' }}>调仓模式说明</div>
        <div style={{ marginBottom: 6 }}><strong>定期调仓</strong>：按固定频率（月/季/年）将组合权重恢复至目标比例。</div>
        <div style={{ marginBottom: 6 }}><strong>阈值调仓</strong>：当资产权重偏离目标值超过设定阈值（如 5%）时触发调仓。</div>
        <div><strong>买入持有</strong>：初始建仓后不再调仓，让权重随市场自由漂移。</div>
      </div>
    </div>
  );
}

function DataSection() {
  const sources = [
    { name: 'Yahoo Finance (yfinance)', scope: '美股/港股/欧股/日股等', note: '默认数据源，30 请求/分钟限流，适合历史日线数据' },
    { name: 'iTick API', scope: '实时行情/外汇', note: '需注册获取 Token，提供更实时的价格数据' },
    { name: 'BaoStock', scope: 'A 股数据', note: 'TCP 直连，覆盖沪深两市历史 K 线与财报' },
    { name: 'TradingView Screener', scope: '财报/因子数据', note: '用于基本面筛选与因子回归分析' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Database className="w-6 h-6" style={{ color: 'var(--brand)' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>数据来源说明</div>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 20 }}>
        平台支持多数据源接入，所有数据本地缓存于 SQLite 数据库，首次查询后优先读取缓存以减少 API 调用。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {sources.map((s) => (
          <div key={s.name} style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 4 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: 'var(--brand)', marginBottom: 6 }}>{s.scope}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)', fontSize: 13, color: 'var(--text-body)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>数据更新策略</span>
        </div>
        建议使用增量更新而非全量更新，避免触发第三方 API 限流。数据引擎会自动记录上次更新时间，
        仅拉取缺失的交易日数据。汇率与通胀数据按月更新。
      </div>
    </div>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: '回测结果与实盘有差异吗？',
      a: '回测基于历史数据，不考虑滑点、冲击成本和交易延迟，且历史表现不代表未来收益。建议结合蒙特卡洛模拟评估策略稳健性。',
    },
    {
      q: '为什么我的组合权重总和不是 100%？',
      a: '权重输入框支持任意数值，平台会在回测时自动归一化。但当权重严重偏离 100% 时会显示红色提示，建议调整至接近 100% 以获得准确结果。',
    },
    {
      q: '蒙特卡洛模拟的次数应该设多少？',
      a: '一般 1000 次即可获得稳定的统计分布。增加次数可提升精度但会延长计算时间，本地部署无次数限制，可根据 CPU 性能调整。',
    },
    {
      q: '如何处理通胀调整？',
      a: '在参数面板勾选「通胀调整」后，平台会使用 CPI 数据将名义收益折算为实际收益。支持全球主要市场的 CPI 数据。',
    },
    {
      q: 'Rust 引擎不可用时会怎样？',
      a: '平台会自动降级到 Node.js 计算引擎，核心功能保持可用，仅性能略有下降。导航栏的状态指示器会显示当前引擎级别。',
    },
    {
      q: '数据存储在哪里？',
      a: '所有数据存储在本地 SQLite 数据库，不上传任何信息到云端。组合配置与偏好设置保存在浏览器 localStorage 中。',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <HelpCircle className="w-6 h-6" style={{ color: 'var(--brand)' }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>常见问题</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {faqs.map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ name, fullName, formula, desc }: { name: string; fullName: string; formula: string; desc: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand)' }}>{name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fullName}</span>
      </div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-strong)', background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 4, marginBottom: 8, overflowX: 'auto' }}>
        {formula}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-body)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--bg-subtle)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-strong)',
          textAlign: 'left',
        }}
      >
        {q}
        <ChevronDown className="w-4 h-4" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
}
