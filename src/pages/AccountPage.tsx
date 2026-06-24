/**
 * @file 账户/个人中心页面
 * @description 用户信息、偏好设置（主题/货币/再平衡频率）、订阅状态、数据统计
 * @route /account
 */
import { useState } from 'react';
import { User, Mail, Palette, DollarSign, RefreshCw, CreditCard, Crown, Calendar, Database, TrendingUp, BarChart3, Folder } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function AccountPage() {
  const { theme, toggleTheme, isDark } = useTheme();
  const [currency, setCurrency] = useState('USD');
  const [rebalance, setRebalance] = useState('quarterly');

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">账户中心</h1>
      </div>

      <div className="bt-main-card card" style={{ padding: 24 }}>
        {/* 用户信息卡片 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--brand)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            BT
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>Backtest User</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'var(--brand-soft)', padding: '2px 8px', borderRadius: 10 }}>
                本地用户
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              <Mail className="w-3.5 h-3.5" />
              user@backtest.local
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
            <div>注册时间</div>
            <div style={{ color: 'var(--text-body)', fontWeight: 600 }}>2026-01-15</div>
          </div>
        </div>

        {/* 数据统计 */}
        <SectionTitle icon={<BarChart3 className="w-5 h-5" />} title="数据统计" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard icon={<Folder className="w-4 h-4" />} label="已保存组合" value="12" />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="回测次数" value="348" />
          <StatCard icon={<Database className="w-4 h-4" />} label="缓存标的" value="1,256" />
          <StatCard icon={<RefreshCw className="w-4 h-4" />} label="数据更新" value="今日" />
        </div>

        {/* 偏好设置 */}
        <SectionTitle icon={<Palette className="w-5 h-5" />} title="偏好设置" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {/* 主题选择 */}
          <PrefRow icon={<Palette className="w-4 h-4" />} label="主题模式" desc={isDark ? '当前：深色' : '当前：浅色'}>
            <div
              className={`toggle-switch ${isDark ? 'active' : ''}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={isDark}
              title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
            />
          </PrefRow>

          {/* 默认基础货币 */}
          <PrefRow icon={<DollarSign className="w-4 h-4" />} label="默认基础货币" desc="回测结果与统计的展示货币">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="portfolio-rebalance-select"
              style={{ width: 140 }}
            >
              <option value="USD">USD · 美元</option>
              <option value="CNY">CNY · 人民币</option>
              <option value="EUR">EUR · 欧元</option>
              <option value="JPY">JPY · 日元</option>
              <option value="HKD">HKD · 港元</option>
            </select>
          </PrefRow>

          {/* 默认再平衡频率 */}
          <PrefRow icon={<RefreshCw className="w-4 h-4" />} label="默认再平衡频率" desc="新建组合时的默认调仓周期">
            <select
              value={rebalance}
              onChange={(e) => setRebalance(e.target.value)}
              className="portfolio-rebalance-select"
              style={{ width: 140 }}
            >
              <option value="none">买入持有</option>
              <option value="monthly">每月</option>
              <option value="quarterly">每季</option>
              <option value="yearly">每年</option>
              <option value="threshold">阈值调仓</option>
            </select>
          </PrefRow>
        </div>

        {/* 订阅状态 */}
        <SectionTitle icon={<CreditCard className="w-5 h-5" />} title="订阅状态" />
        <div style={{
          padding: 20,
          background: 'var(--brand-soft)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--brand)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Crown className="w-5 h-5" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
              Free · 免费版
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <Calendar className="w-3 h-3" />
              本地部署 · 无到期时间
            </div>
          </div>
          <button
            className="main-action-btn"
            style={{ minHeight: 38, padding: '0 18px', fontSize: 13 }}
            onClick={() => { window.location.hash = '#/pricing'; }}
          >
            升级方案
          </button>
        </div>

        <div style={{ marginTop: 20, padding: 14, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <User className="w-3.5 h-3.5" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
          当前为本地部署版本，用户信息与偏好设置保存在浏览器 localStorage 中，不上传任何数据到云端。
          主题切换会即时生效并持久化。
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: 'var(--brand)' }}>
      {icon}
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</span>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)' }}>{value}</div>
    </div>
  );
}

function PrefRow({ icon, label, desc, children }: { icon: React.ReactNode; label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      background: 'var(--bg-subtle)',
      borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ color: 'var(--brand)', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
