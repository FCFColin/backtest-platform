/**
 * @file 关于页面
 * @description 展示平台介绍、使用限额及升级方案，通过 section 参数切换不同子栏目
 * @route /about、/limits、/upgrade
 */
import { Link } from 'react-router-dom';
import { BarChart3, Shield, Globe, Clock, Database } from 'lucide-react';

export default function AboutPage({ section }: { section?: string }) {
  const activeSection = section || 'about';

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">
          {activeSection === 'limits'
            ? '使用限额'
            : activeSection === 'upgrade'
              ? '升级方案'
              : '关于平台'}
        </h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        <AboutTabs activeSection={activeSection} />
        {activeSection === 'about' && <AboutSection />}
        {activeSection === 'limits' && <LimitsSection />}
        {activeSection === 'upgrade' && <UpgradeSection />}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'about', label: '关于', to: '/about' },
  { key: 'limits', label: '限额', to: '/limits' },
  { key: 'upgrade', label: '升级', to: '/upgrade' },
];

function AboutTabs({ activeSection }: { activeSection: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 24,
        borderBottom: '2px solid var(--border-soft)',
        paddingBottom: 12,
      }}
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className="no-underline"
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: activeSection === tab.key ? 'var(--brand)' : 'var(--text-muted)',
            background: activeSection === tab.key ? 'var(--brand-soft)' : 'transparent',
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function AboutSection() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <BarChart3 className="w-8 h-8" style={{ color: 'var(--brand)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>回测平台</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            v1.0.0 · 本地部署 · 数据自主可控
          </div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        回测平台是一款开源的投资组合回测工具，支持多市场（美股/A股/港股/日股/欧股等）、多货币（USD/CNY）、
        通胀调整、汇率换算、蒙特卡洛模拟、组合优化和有效前沿分析。所有数据本地存储，无需注册，无隐私泄露风险。
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <FeatureCard
          icon={<Shield className="w-5 h-5" />}
          title="本地部署"
          desc="所有数据存储在本地，无需上传到云端，隐私安全"
        />
        <FeatureCard
          icon={<Globe className="w-5 h-5" />}
          title="多市场支持"
          desc="美股、A股、港股、日股、欧股等全球主要市场"
        />
        <FeatureCard
          icon={<Clock className="w-5 h-5" />}
          title="高性能引擎"
          desc="Rust回测引擎 + Go数据服务，毫秒级响应"
        />
        <FeatureCard
          icon={<Database className="w-5 h-5" />}
          title="丰富数据"
          desc="支持12000+标的，含价格、财报、因子数据"
        />
      </div>
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-control)',
          fontSize: 13,
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-body)' }}>技术栈</div>
        <div>Rust (回测引擎) · Go (数据服务) · TypeScript (前端+API胶水层) · React + Recharts</div>
      </div>
    </div>
  );
}

function LimitsSection() {
  return (
    <div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        当前为本地部署版本，无云端限制。以下限额仅适用于数据获取和计算资源：
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <LimitCard label="组合数量" value="无限制" desc="可同时回测任意数量组合" />
        <LimitCard label="标的数量" value="12,000+" desc="已缓存标的数量，持续增长" />
        <LimitCard label="回测时间范围" value="全部历史" desc="从最早可用数据至今" />
        <LimitCard label="蒙特卡洛模拟" value="无限制" desc="本地计算，无次数限制" />
        <LimitCard label="数据获取频率" value="保守策略" desc="Yahoo 30次/分钟，iTick需Token" />
        <LimitCard label="并发回测" value="受CPU限制" desc="Go引擎使用goroutine并行" />
      </div>
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: 'var(--warning-soft, #fef3c7)',
          borderRadius: 'var(--radius-control)',
          fontSize: 13,
          color: 'var(--text-body)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>注意</div>
        数据获取受第三方API限流影响。yfinance默认30请求/分钟，iTick API需注册获取Token。
        建议使用增量更新而非全量更新，避免触发限流。
      </div>
    </div>
  );
}

function UpgradeSection() {
  return (
    <div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        当前版本已包含所有核心功能。以下为可选的增强方案：
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <PlanCard
          title="免费版（当前）"
          price="免费"
          current
          features={[
            '组合回测 + 16个分析Tab',
            '蒙特卡洛模拟',
            '组合优化 + 有效前沿',
            '资产分析',
            '12,000+标的',
            'USD/CNY双货币',
            '通胀调整 + 汇率换算',
          ]}
        />
        <PlanCard
          title="数据增强"
          price="自行配置"
          features={[
            'iTick API Token（实时行情）',
            'TradingView Screener（财报数据）',
            'BaoStock TCP直连（A股数据）',
            '自定义数据源接入',
            '更快的获取速度',
            '更高的因子覆盖率',
          ]}
        />
        <PlanCard
          title="性能增强"
          price="硬件升级"
          features={[
            '更多CPU核心 → 更快蒙特卡洛',
            'SSD → 更快数据加载',
            '更大内存 → 更多缓存标的',
            'GPU加速（未来支持）',
          ]}
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}
    >
      <div style={{ color: 'var(--brand)', marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  );
}

function LimitCard({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div
      style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  features,
  current,
}: {
  title: string;
  price: string;
  features: string[];
  current?: boolean;
}) {
  return (
    <div
      style={{
        padding: 20,
        background: current ? 'var(--brand-soft)' : 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        border: current ? '2px solid var(--brand)' : '1px solid var(--border-soft)',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand)', marginBottom: 16 }}>
        {price}
      </div>
      {features.map((f, i) => (
        <div
          key={i}
          style={{
            fontSize: 13,
            color: 'var(--text-body)',
            padding: '4px 0',
            paddingLeft: 16,
            position: 'relative',
          }}
        >
          <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>✓</span>
          {f}
        </div>
      ))}
      {current && (
        <div
          style={{
            marginTop: 16,
            padding: '8px 16px',
            background: 'var(--brand)',
            color: 'white',
            borderRadius: 8,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          当前方案
        </div>
      )}
    </div>
  );
}
