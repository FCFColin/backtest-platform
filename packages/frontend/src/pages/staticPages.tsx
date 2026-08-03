import { useState, type ReactNode, type ComponentType, type FormEvent } from 'react';
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
import { Badge, Button, Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { StaticPageShell } from '@/components/layout/ToolPageLayout.js';
import { useToastStore } from '@/store/toastStore';
import aboutData from './about/aboutData.json';

const FEATURE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Shield,
  Globe,
  Clock,
  Database,
};

function InfoCard({
  icon,
  title,
  value,
  desc,
  highlight,
}: {
  icon?: ReactNode;
  title?: string;
  value?: string;
  desc?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${highlight ? 'border-2 border-brand bg-brand/10' : 'bg-input-bg'}`}
    >
      {icon && <div className="mb-2 text-brand">{icon}</div>}
      {value && <div className="mb-0.5 text-h2 font-bold text-fg">{value}</div>}
      {title && (
        <div
          className={`mb-1 text-body font-semibold text-fg ${value ? 'text-caption text-fg-tertiary' : ''}`}
        >
          {title}
        </div>
      )}
      {desc && <div className="text-caption text-fg-tertiary">{desc}</div>}
    </div>
  );
}

function AboutContent() {
  const { t } = useTranslation();
  const features = aboutData.features as { iconName: string; titleKey: string; descKey: string }[];
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
            <InfoCard
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
function LimitsContent() {
  const { t } = useTranslation();
  const limits = (
    aboutData.limits as { labelKey: string; valueKey: string; descKey: string }[]
  ).map((l) => ({ label: t(l.labelKey), value: t(l.valueKey), desc: t(l.descKey) }));
  return (
    <div>
      <div className="mb-6 text-body leading-loose text-fg-secondary">
        {t('about.limits.intro')}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {limits.map((l) => (
          <InfoCard key={l.label} title={l.label} value={l.value} desc={l.desc} />
        ))}
      </div>
      <div className="mt-6 rounded-lg bg-warning/10 p-4 text-label text-fg-secondary">
        <div className="mb-1 font-semibold">{t('about.limits.noticeTitle')}</div>
        {t('about.limits.noticeContent')}
      </div>
    </div>
  );
}
function UpgradeContent() {
  const { t } = useTranslation();
  const plans = (
    aboutData.plans as {
      titleKey: string;
      priceKey: string;
      featuresKey: string;
      current?: boolean;
    }[]
  ).map((p) => ({
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
          <div
            key={p.title}
            className={`rounded-lg p-5 ${p.current ? 'border-2 border-brand bg-brand/10' : 'border border-subtle bg-input-bg'}`}
          >
            <div className="mb-1 text-h3 font-bold text-fg">{p.title}</div>
            <div className="mb-4 text-h1 font-bold text-brand">{p.price}</div>
            {p.features.map((f, i) => (
              <div key={i} className="relative py-1 pl-4 text-label text-fg-secondary">
                <span className="absolute left-0 text-success">✓</span>
                {f}
              </div>
            ))}
            {p.current && (
              <div className="mt-4 rounded-lg bg-brand py-2 text-center text-label font-semibold text-brand-fg">
                {t('about.upgrade.currentPlan')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
export function AboutPage({ section }: { section?: string }) {
  const { t } = useTranslation();
  const s = section || 'about';
  const titleKey =
    s === 'limits' ? 'about.limitsTitle' : s === 'upgrade' ? 'about.upgradeTitle' : 'about.title';
  const tabs = [
    { key: 'about', label: t('about.tabs.about'), to: '/about' },
    { key: 'limits', label: t('about.tabs.limits'), to: '/limits' },
    { key: 'upgrade', label: t('about.tabs.upgrade'), to: '/upgrade' },
  ];
  return (
    <StaticPageShell title={t(titleKey)}>
      <div className="mb-6 flex gap-2 border-b-2 border-subtle pb-3">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={`rounded-lg px-4 py-2 text-label font-semibold no-underline ${s === tab.key ? 'bg-brand/10 text-brand' : 'text-fg-tertiary hover:text-fg-secondary'}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {s === 'about' && <AboutContent />}
      {s === 'limits' && <LimitsContent />}
      {s === 'upgrade' && <UpgradeContent />}
    </StaticPageShell>
  );
}

type ChangeType = 'added' | 'improved' | 'fixed';
const CHANGE_META: Record<
  ChangeType,
  { labelKey: string; variant: 'success' | 'asset' | 'secondary'; icon: ReactNode }
> = {
  added: { labelKey: 'changelog.added', variant: 'success', icon: <Plus className="size-3" /> },
  improved: {
    labelKey: 'changelog.improved',
    variant: 'asset',
    icon: <Wrench className="size-3" />,
  },
  fixed: { labelKey: 'changelog.fixed', variant: 'secondary', icon: <Bug className="size-3" /> },
};
export function ChangelogPage() {
  const { t } = useTranslation();
  const raw = t('changelog.versions', { returnObjects: true }) as Record<
    string,
    { date: string; highlight?: string; changes: { type: ChangeType; text: string }[] }
  >;
  const versions = Object.entries(raw).map(([version, v]) => ({ version, ...v }));
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
          <div key={v.version} className="relative pb-7 pl-11">
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
                {v.changes.map((c, i) => {
                  const cfg = CHANGE_META[c.type];
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <Badge
                        variant={cfg.variant}
                        size="sm"
                        className="mt-0.5 shrink-0 min-w-[44px] justify-center"
                      >
                        {cfg.icon}
                        {t(cfg.labelKey)}
                      </Badge>
                      <span className="text-label leading-relaxed text-fg-secondary">{c.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-input-bg p-4 text-caption text-fg-tertiary">
        <GitCommit className="size-4" />
        {t('changelog.gitHistoryHint')}
      </div>
    </StaticPageShell>
  );
}

const CONTACT_CLS =
  'flex items-center gap-3 rounded-xl border border-border bg-input-bg p-4 no-underline text-fg-secondary transition-colors hover:border-border-strong';
function ContactCards() {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <a href="mailto:support@example.com" className={CONTACT_CLS}>
        <Mail className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.emailSupportTitle')}</div>
          <div className="text-caption text-fg-tertiary">support@example.com</div>
        </div>
      </a>
      <button
        type="button"
        onClick={() => addToast('warning', t('contact.githubNotConfigured'))}
        className={CONTACT_CLS}
      >
        <Github className="size-5 text-brand" />
        <div>
          <div className="text-body font-semibold">{t('contact.githubIssuesTitle')}</div>
          <div className="text-caption text-fg-tertiary">{t('contact.githubIssuesDesc')}</div>
        </div>
      </button>
    </div>
  );
}
export function ContactPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const handleSubmit = (e: FormEvent) => {
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
      <ContactCards />
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center gap-2 text-body font-semibold text-fg">
          <MessageSquare className="size-4" />
          {t('contact.feedbackTitle')}
        </div>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              {
                id: 'contact-name',
                type: 'text',
                value: name,
                onChange: setName,
                ph: 'contact.namePlaceholder',
              },
              {
                id: 'contact-email',
                type: 'email',
                value: email,
                onChange: setEmail,
                ph: 'contact.emailPlaceholder',
              },
            ] as const
          ).map((f) => (
            <Field key={f.id}>
              <FieldLabel htmlFor={f.id}>{t(f.ph)}</FieldLabel>
              <Input
                id={f.id}
                type={f.type}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                placeholder={t(f.ph)}
              />
            </Field>
          ))}
        </div>
        <Field className="mb-4">
          <FieldLabel htmlFor="contact-message">{t('contact.messagePlaceholder')}</FieldLabel>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
    </StaticPageShell>
  );
}
