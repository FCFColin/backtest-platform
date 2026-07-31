import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Shield,
  Globe,
  Clock,
  Database,
  Mail,
  MessageSquare,
  Github,
  GitCommit,
  Plus,
  Wrench,
  Bug,
  Calendar,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Badge } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { StaticPageShell } from '@/components/layout/StaticPageShell.js';
import { useToastStore } from '@/store/toastStore';
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
export function AboutPage({ section }: { section?: string }) {
  const { t } = useTranslation();
  const activeSection = section || 'about';
  const titleKey =
    activeSection === 'limits'
      ? 'about.limitsTitle'
      : activeSection === 'upgrade'
        ? 'about.upgradeTitle'
        : 'about.title';
  return (
    <StaticPageShell title={t(titleKey)}>
      <AboutTabs activeSection={activeSection} />
      {activeSection === 'about' && <AboutSection />}
      {activeSection === 'limits' && <LimitsSection />}
      {activeSection === 'upgrade' && <UpgradeSection />}
    </StaticPageShell>
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
    <div className="mb-6 flex gap-2 border-b-2 border-subtle pb-3">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          className={`rounded-lg px-4 py-2 text-label font-semibold no-underline ${activeSection === tab.key ? 'bg-brand/10 text-brand' : 'text-fg-tertiary hover:text-fg-secondary'}`}
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
          return (
            <FeatureCard
              key={f.titleKey}
              icon={<Icon className="size-5" />}
              title={t(f.titleKey)}
              desc={t(f.descKey)}
            />
          );
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
    desc: t(l.descKey),
  }));
  return (
    <div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">
        {t('about.limits.intro')}
      </div>
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
    current: p.current,
  }));
  return (
    <div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">
        {t('about.upgrade.intro')}
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
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
      className={`rounded-lg p-5 ${current ? 'border-2 border-brand bg-brand/10' : 'border border-subtle bg-input-bg'}`}
    >
      <div className="mb-1 text-h3 font-bold text-fg">{title}</div>
      <div className="mb-4 text-h1 font-bold text-brand">{price}</div>
      {features.map((f, i) => (
        <div key={i} className="relative py-1 pl-4 text-label text-fg-secondary">
          <span className="absolute left-0 text-success">✓</span>
          {f}
        </div>
      ))}
      {current && (
        <div className="mt-4 rounded-lg bg-brand py-2 text-center text-label font-semibold text-brand-fg">
          {t('about.upgrade.currentPlan')}
        </div>
      )}
    </div>
  );
}

type ChangeType = 'added' | 'improved' | 'fixed';
interface ChangeEntry {
  type: ChangeType;
  text: string;
}
interface VersionEntry {
  version: string;
  date: string;
  highlight?: string;
  changes: ChangeEntry[];
}
function useVersions(): VersionEntry[] {
  const { t } = useTranslation();
  const raw = t('changelog.versions', { returnObjects: true }) as Record<
    string,
    { date: string; highlight?: string; changes: ChangeEntry[] }
  >;
  return Object.entries(raw).map(([version, v]) => ({ version, ...v }));
}
function useTypeConfig(): Record<
  ChangeType,
  { label: string; variant: 'success' | 'asset' | 'secondary'; icon: ReactNode }
> {
  const { t } = useTranslation();
  return {
    added: {
      label: t('changelog.added'),
      variant: 'success',
      icon: <Plus className="size-3" />,
    },
    improved: {
      label: t('changelog.improved'),
      variant: 'asset',
      icon: <Wrench className="size-3" />,
    },
    fixed: {
      label: t('changelog.fixed'),
      variant: 'secondary',
      icon: <Bug className="size-3" />,
    },
  };
}
function ChangeTag({ c }: { c: ChangeEntry }) {
  const cfg = useTypeConfig()[c.type];
  return (
    <Badge variant={cfg.variant} size="sm" className="mt-0.5 shrink-0 min-w-[44px] justify-center">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}
function VersionTimelineItem({ v }: { v: VersionEntry }) {
  return (
    <div className="relative pb-7 pl-11">
      <div className="absolute left-3 top-1 size-3.5 rounded-full border-[3px] border-elevated bg-brand ring-2 ring-brand" />
      <div className="rounded-lg bg-input-bg p-4">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="text-h2 font-bold text-fg">{v.version}</span>
          <span className="flex items-center gap-1 text-caption text-fg-tertiary">
            <Calendar className="size-3" />
            {v.date}
          </span>
          {v.highlight && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-label-tiny font-semibold text-brand">
              {v.highlight}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {v.changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChangeTag c={c} />
              <span className="text-label leading-relaxed text-fg-secondary">{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export function ChangelogPage() {
  const { t } = useTranslation();
  const versions = useVersions();
  return (
    <StaticPageShell title={t('changelog.title')}>
      <div className="mb-6 text-body leading-loose text-fg-secondary">
        {t('changelog.intro')}
        <span className="font-semibold text-success"> {t('changelog.added')}</span>
        {' · '}
        <span className="font-semibold text-brand">{t('changelog.improved')}</span>
        {' · '}
        <span className="font-semibold text-warning"> {t('changelog.fixed')}</span>
        {t('changelog.categoriesSuffix')}
      </div>
      <div className="relative pl-2">
        <div className="absolute bottom-2 left-[19px] top-2 w-0.5 bg-border-subtle" />
        {versions.map((v) => (
          <VersionTimelineItem key={v.version} v={v} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-input-bg p-4 text-caption text-fg-tertiary">
        <GitCommit className="size-4" />
        {t('changelog.gitHistoryHint')}
      </div>
    </StaticPageShell>
  );
}

function ContactLinks({ onGithubClick }: { onGithubClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <a
        href="mailto:support@example.com"
        className="flex items-center gap-3 rounded-xl border border-border bg-input-bg p-4 no-underline text-fg-secondary transition-colors hover:border-border-strong"
      >
        <Mail className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.emailSupportTitle')}</div>
          <div className="text-caption text-fg-tertiary">support@example.com</div>
        </div>
      </a>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onGithubClick();
        }}
        className="flex items-center gap-3 rounded-xl border border-border bg-input-bg p-4 no-underline text-fg-secondary transition-colors hover:border-border-strong"
      >
        <Github className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.githubIssuesTitle')}</div>
          <div className="text-caption text-fg-tertiary">{t('contact.githubIssuesDesc')}</div>
        </div>
      </a>
    </div>
  );
}
function FeedbackForm({
  name,
  email,
  message,
  onNameChange,
  onEmailChange,
  onMessageChange,
  onSubmit,
}: {
  name: string;
  email: string;
  message: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onMessageChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4 flex items-center gap-2 text-body font-semibold text-fg">
        <MessageSquare className="size-4" />
        {t('contact.feedbackTitle')}
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="contact-name">{t('contact.namePlaceholder')}</FieldLabel>
          <Input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('contact.namePlaceholder')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-email">{t('contact.emailPlaceholder')}</FieldLabel>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={t('contact.emailPlaceholder')}
          />
        </Field>
      </div>
      <Field className="mb-4">
        <FieldLabel htmlFor="contact-message">{t('contact.messagePlaceholder')}</FieldLabel>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={t('contact.messagePlaceholder')}
          className="w-full resize-y rounded-md border border-border bg-input-bg px-3 py-2 text-body text-fg placeholder:text-fg-tertiary transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          style={{ minHeight: 120 }}
        />
      </Field>
      <Button type="submit" variant="primary">
        <Mail className="size-4" />
        {t('contact.submit')}
      </Button>
    </form>
  );
}
export function ContactPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      addToast('warning', t('contact.fillAllFields'));
      return;
    }
    const subject = encodeURIComponent(`[Feedback] ${name} - ${message.slice(0, 30)}...`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:support@example.com?subject=${subject}&body=${body}`;
    addToast('success', t('contact.openingMailClient'));
  };
  return (
    <StaticPageShell title={t('contact.title')} cardClassName="max-w-3xl p-6">
      <p className="mb-6 text-fg-tertiary">{t('contact.intro')}</p>
      <ContactLinks onGithubClick={() => addToast('warning', t('contact.githubNotConfigured'))} />
      <FeedbackForm
        name={name}
        email={email}
        message={message}
        onNameChange={setName}
        onEmailChange={setEmail}
        onMessageChange={setMessage}
        onSubmit={handleSubmit}
      />
    </StaticPageShell>
  );
}
