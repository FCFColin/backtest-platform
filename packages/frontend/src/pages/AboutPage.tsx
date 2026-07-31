import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, Shield, Globe, Clock, Database } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
import aboutData from './about/aboutData.json';
const FEATURE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Shield,
  Globe,
  Clock,
  Database
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
  const { t } = useTranslation();
  const activeSection = section || 'about';
  const titleKey = activeSection === 'limits' ? 'about.limitsTitle' : activeSection === 'upgrade' ? 'about.upgradeTitle' : 'about.title';
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t(titleKey)}</h1>
      <Card className="p-6">
        <AboutTabs activeSection={activeSection} />
        {activeSection === 'about' && <AboutSection />}
        {activeSection === 'limits' && <LimitsSection />}
        {activeSection === 'upgrade' && <UpgradeSection />}
      </Card>
    </div>
  );
}
function AboutTabs({ activeSection }: { activeSection: string }) {
  const { t } = useTranslation();
  const tabs = [
    { key: 'about', label: t('about.tabs.about'), to: '/about' },
    { key: 'limits', label: t('about.tabs.limits'), to: '/limits' },
    { key: 'upgrade', label: t('about.tabs.upgrade'), to: '/upgrade' }
  ];
  return (
    <div className="mb-6 flex gap-2 border-b-2 border-subtle pb-3">
      {tabs.map((tab) => (
        <Link key={tab.key} to={tab.to} className={`rounded-lg px-4 py-2 text-label font-semibold no-underline ${activeSection === tab.key ? 'bg-brand/10 text-brand' : 'text-fg-tertiary hover:text-fg-secondary'}`}>
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
      <div className="mb-6 flex items-center gap-3">
        <BarChart3 className="size-8 text-brand" />
        <div>
          <div className="text-h2 font-bold text-fg">{t('about.brandName')}</div>
          <div className="text-label text-fg-tertiary">{t('about.versionInfo')}</div>
        </div>
      </div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">{t('about.intro')}</div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {features.map((f) => {
          const Icon = FEATURE_ICONS[f.iconName] ?? Shield;
          return <FeatureCard key={f.titleKey} icon={<Icon className="size-5" />} title={t(f.titleKey)} desc={t(f.descKey)} />;
        })}
      </div>
      <div className="mt-6 rounded-lg bg-input-bg p-4 text-label text-fg-tertiary">
        <div className="mb-2 font-semibold text-fg-secondary">{t('about.techStackTitle')}</div>
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
    desc: t(l.descKey)
  }));
  return (
    <div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">{t('about.limits.intro')}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {limits.map((l) => (
          <LimitCard key={l.label} label={l.label} value={l.value} desc={l.desc} />
        ))}
      </div>
      <div className="mt-6 rounded-lg bg-warning/10 p-4 text-label text-fg-secondary">
        <div className="mb-1 font-semibold">{t('about.limits.noticeTitle')}</div>
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
    current: p.current
  }));
  return (
    <div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">{t('about.upgrade.intro')}</div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {plans.map((p) => (
          <PlanCard key={p.title} title={p.title} price={p.price} current={p.current} features={p.features} />
        ))}
      </div>
    </div>
  );
}
function FeatureCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg bg-input-bg p-4">
      <div className="mb-2 text-brand">{icon}</div>
      <div className="mb-1 text-body font-semibold text-fg">{title}</div>
      <div className="text-caption text-fg-tertiary">{desc}</div>
    </div>
  );
}
function LimitCard({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="rounded-lg bg-input-bg p-4">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div className="mb-0.5 text-h2 font-bold text-fg">{value}</div>
      <div className="text-caption text-fg-tertiary">{desc}</div>
    </div>
  );
}
function PlanCard({ title, price, features, current }: { title: string; price: string; features: string[]; current?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-lg p-5 ${current ? 'border-2 border-brand bg-brand/10' : 'border border-subtle bg-input-bg'}`}>
      <div className="mb-1 text-h3 font-bold text-fg">{title}</div>
      <div className="mb-4 text-h1 font-bold text-brand">{price}</div>
      {features.map((f, i) => (
        <div key={i} className="relative py-1 pl-4 text-label text-fg-secondary">
          <span className="absolute left-0 text-success">✓</span>
          {f}
        </div>
      ))}
      {current && <div className="mt-4 rounded-lg bg-brand py-2 text-center text-label font-semibold text-brand-fg">{t('about.upgrade.currentPlan')}</div>}
    </div>
  );
}
