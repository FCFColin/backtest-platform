/**
 * @file 定价页面
 * @description Free / Pro / Pro+ 三档定价对比，Pro 档高亮推荐
 * @route /pricing
 */
import { Check, X, Star, Zap, Crown } from 'lucide-react';

interface Plan {
  name: string;
  icon: React.ReactNode;
  price: string;
  period: string;
  desc: string;
  recommended?: boolean;
  features: { text: string; included: boolean }[];
  cta: string;
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    icon: <Star className="w-5 h-5" />,
    price: '免费',
    period: '',
    desc: '适合个人学习与基础回测体验',
    features: [
      { text: '基础组合回测', included: true },
      { text: '最多 3 个组合', included: true },
      { text: '1 年历史数据', included: true },
      { text: '基础统计指标', included: true },
      { text: '蒙特卡洛模拟', included: false },
      { text: '组合优化', included: false },
      { text: 'API 访问', included: false },
      { text: '优先技术支持', included: false },
    ],
    cta: '当前方案',
  },
  {
    name: 'Pro',
    icon: <Zap className="w-5 h-5" />,
    price: '$10',
    period: '/月',
    desc: '面向进阶投资者的完整回测工具集',
    recommended: true,
    features: [
      { text: '高级组合回测', included: true },
      { text: '无限组合数量', included: true },
      { text: '10 年历史数据', included: true },
      { text: '全部 16 个分析 Tab', included: true },
      { text: '蒙特卡洛模拟', included: true },
      { text: '组合优化 + 有效前沿', included: true },
      { text: 'API 访问', included: false },
      { text: '优先技术支持', included: false },
    ],
    cta: '升级到 Pro',
  },
  {
    name: 'Pro+',
    icon: <Crown className="w-5 h-5" />,
    price: '$25',
    period: '/月',
    desc: '专业级全功能方案，含 API 与专属支持',
    features: [
      { text: '所有 Pro 功能', included: true },
      { text: '无限组合数量', included: true },
      { text: '全部历史数据', included: true },
      { text: '全部 16 个分析 Tab', included: true },
      { text: '蒙特卡洛模拟', included: true },
      { text: '组合优化 + 有效前沿', included: true },
      { text: 'API 访问（REST + WebSocket）', included: true },
      { text: '优先技术支持（24h 响应）', included: true },
    ],
    cta: '升级到 Pro+',
  },
];

export default function PricingPage() {
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">定价方案</h1>
      </div>

      <div className="bt-main-card card" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24, textAlign: 'center' }}>
          选择适合你的方案。所有方案均支持随时升级或降级，无需长期合约。
        </div>

        {/* 三列定价卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24, alignItems: 'stretch' }}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        {/* 限额对比表 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>功能限额对比</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-soft)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>功能</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Free</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--brand)', fontWeight: 700 }}>Pro</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Pro+</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow feature="组合数量" free="3 个" pro="无限" proPlus="无限" />
                <CompareRow feature="历史数据范围" free="1 年" pro="10 年" proPlus="全部" />
                <CompareRow feature="分析 Tab" free="基础" pro="全部 16 个" proPlus="全部 16 个" />
                <CompareRow feature="蒙特卡洛模拟" free="—" pro="✓" proPlus="✓" />
                <CompareRow feature="组合优化" free="—" pro="✓" proPlus="✓" />
                <CompareRow feature="API 访问" free="—" pro="—" proPlus="✓" />
                <CompareRow feature="优先支持" free="—" pro="—" proPlus="24h 响应" />
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-body)' }}>说明：</strong>
          当前为本地部署版本，已包含全部核心功能。上述定价方案仅适用于未来云端服务版本，本地部署无任何使用限制。
          数据获取仍受第三方 API 限流影响（如 Yahoo 30 次/分钟）。
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isRecommended = plan.recommended;
  return (
    <div style={{
      padding: 24,
      background: isRecommended ? 'var(--brand-soft)' : 'var(--bg-subtle)',
      borderRadius: 'var(--radius-control)',
      border: isRecommended ? '2px solid var(--brand)' : '1px solid var(--border-soft)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {isRecommended && (
        <div style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 14px',
          background: 'var(--brand)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 12,
          whiteSpace: 'nowrap',
        }}>
          推荐
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: isRecommended ? 'var(--brand)' : 'var(--text-muted)' }}>
        {plan.icon}
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{plan.name}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: isRecommended ? 'var(--brand)' : 'var(--text-strong)' }}>{plan.price}</span>
        {plan.period && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{plan.period}</span>}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, minHeight: 32 }}>{plan.desc}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            {f.included ? (
              <Check className="w-4 h-4" style={{ color: 'var(--success)', flexShrink: 0 }} />
            ) : (
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }} />
            )}
            <span style={{ color: f.included ? 'var(--text-body)' : 'var(--text-muted)', opacity: f.included ? 1 : 0.7 }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>

      <button style={{
        marginTop: 24,
        padding: '10px 16px',
        background: isRecommended ? 'var(--brand)' : 'transparent',
        color: isRecommended ? '#fff' : 'var(--brand)',
        border: isRecommended ? 'none' : '1px solid var(--brand)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }}>
        {plan.cta}
      </button>
    </div>
  );
}

function CompareRow({ feature, free, pro, proPlus }: { feature: string; free: string; pro: string; proPlus: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <td style={{ padding: '10px 12px', color: 'var(--text-body)', fontWeight: 500 }}>{feature}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{free}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--brand)', fontWeight: 600 }}>{pro}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-body)' }}>{proPlus}</td>
    </tr>
  );
}
