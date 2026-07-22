/**
 * @file 关于页面
 * @description 展示平台介绍、使用限额及升级方案，通过 section 参数切换不同子栏目
 * @route /about、/limits、/upgrade
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, Shield, Globe, Clock, Database } from 'lucide-react';
import type { ComponentType } from 'react';
import { StandardPageShell } from '../components/shells/StandardPageShell.js';
import aboutData from './about/aboutData.json';

const FEATURE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Shield,
  Globe,
  Clock,
  Database,
};

interface FeatureItem {
  iconName: string;
  titleKey: string;
  descKey: string;
}

interface LimitItem {
  labelKey: string;
  valueKey: string;
  descKey: string;
}

interface PlanItem {
  titleKey: string;
  priceKey: string;
  featuresKey: string;
  current?: boolean;
}

export default function AboutPage({ section }: { section?: string }) {
  const activeSection = section || 'about';
  const titleKey =
    activeSection === 'limits'
      ? 'about.limitsTitle'
      : activeSection === 'upgrade'
        ? 'about.upgradeTitle'
        : 'about.title';

  return (
    <StandardPageShell config={{ titleKey }}>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        <AboutTabs activeSection={activeSection} />
        {activeSection === 'about' && <AboutSection />}
        {activeSection === 'limits' && <LimitsSection />}
        {activeSection === 'upgrade' && <UpgradeSection />}
      </div>
    </StandardPageShell>
  );
}

function AboutTabs({ activeSection }: { activeSection: string }) {
  const { t } = useTranslation();
  const tabs = [
    { key: 'about', label: t('about.tabs.about'), to: '/about' },
    { key: 'limits', label: t('about.tabs.limits'), to: '/limits' },
    { key: 'upgrade', label: t('about.tabs.upgrade'), to: '/upgrade' },
  ];
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
      {tabs.map((tab) => (
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
  const { t } = useTranslation();
  const features = aboutData.features as FeatureItem[];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <BarChart3 className="w-8 h-8" style={{ color: 'var(--brand)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)' }}>
            {t('about.brandName')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('about.versionInfo')}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        {t('about.intro')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {features.map((f) => {
          const Icon = FEATURE_ICONS[f.iconName] ?? Shield;
          return (
            <FeatureCard
              key={f.titleKey}
              icon={<Icon className="w-5 h-5" />}
              title={t(f.titleKey)}
              desc={t(f.descKey)}
            />
          );
        })}
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
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-body)' }}>
          {t('about.techStackTitle')}
        </div>
        <div>{t('about.techStackContent')}</div>
      </div>
    </div>
  );
}

function LimitsSection() {
  const { t } = useTranslation();
  const limits = (aboutData.limits as LimitItem[]).map((l) => ({
    label: t(l.labelKey),
    value: t(l.valueKey),
    desc: t(l.descKey),
  }));
  return (
    <div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        {t('about.limits.intro')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {limits.map((l) => (
          <LimitCard key={l.label} label={l.label} value={l.value} desc={l.desc} />
        ))}
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('about.limits.noticeTitle')}</div>
        {t('about.limits.noticeContent')}
      </div>
    </div>
  );
}

function UpgradeSection() {
  const { t } = useTranslation();
  const plans = (aboutData.plans as PlanItem[]).map((p) => ({
    title: t(p.titleKey),
    price: t(p.priceKey),
    features: t(p.featuresKey, { returnObjects: true }) as string[],
    current: p.current,
  }));
  return (
    <div>
      <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
        {t('about.upgrade.intro')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {plans.map((p) => (
          <PlanCard
            key={p.title}
            title={p.title}
            price={p.price}
            current={p.current}
            features={p.features}
          />
        ))}
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
  const { t } = useTranslation();
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
          {t('about.upgrade.currentPlan')}
        </div>
      )}
    </div>
  );
}
