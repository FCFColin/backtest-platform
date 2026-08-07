import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Database, HelpCircle, ChevronDown, Calculator, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { StaticPageShell } from '@/components/layout/ToolPageLayout.js';
import helpData from './help/helpData.json';
type Section = 'methodology' | 'data' | 'faq';
interface MetricInfo {
  fullName: string;
  desc: string;
}
interface FaqItem {
  q: string;
  a: string;
}
interface DataSource {
  name: string;
  scope: string;
  note: string;
}
interface MetricStatic {
  name: string;
  formula: string;
  i18nKey: string;
}
export default function HelpPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('methodology');
  const tabs: { key: Section; label: string; icon: ReactNode }[] = [
    {
      key: 'methodology',
      label: t('Methodology'),
      icon: <Calculator className="size-4" />,
    },
    { key: 'data', label: t('Data Source'), icon: <Database className="size-4" /> },
    { key: 'faq', label: t('FAQ'), icon: <HelpCircle className="size-4" /> },
  ];
  return (
    <StaticPageShell title={t('Help Center')}>
      <div className="mb-6 flex gap-2 border-b-2 border-subtle pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-label font-semibold transition-colors ${section === tab.key ? 'bg-brand/10 text-brand' : 'text-fg-tertiary hover:text-fg-secondary'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {section === 'methodology' && <MethodologySection />}
      {section === 'data' && <DataSection />}
      {section === 'faq' && <FaqSection />}
    </StaticPageShell>
  );
}
function HelpSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        {icon}
        <div className="text-h2 font-bold text-fg">{title}</div>
      </div>
      {description && (
        <div className="mb-5 text-body leading-loose text-fg-secondary">{description}</div>
      )}
      {children}
    </div>
  );
}
function HelpGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
      {children}
    </div>
  );
}
function HelpInfoBox({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-input-bg p-4 text-label text-fg-secondary">
      {(title || icon) && (
        <div className="mb-2 flex items-center gap-2">
          {icon}
          {title && <span className="font-semibold text-fg">{title}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
function RebalancingModesInfo() {
  const { t } = useTranslation();
  return (
    <HelpInfoBox title={t('Rebalancing Mode Explanation')}>
      <div className="mb-1.5">
        <strong>
          {t(
            'Periodic Rebalancing: Restore portfolio weights to target proportions at fixed frequencies (monthly/quarterly/annually).',
          )}
        </strong>
      </div>
      <div className="mb-1.5">
        <strong>
          {t(
            'Threshold Rebalancing: Trigger rebalancing when asset weights deviate from target by more than a set threshold (e.g., 5%).',
          )}
        </strong>
      </div>
      <div>
        <strong>
          {t(
            'Buy and Hold: No rebalancing after initial setup; let weights drift freely with the market.',
          )}
        </strong>
      </div>
    </HelpInfoBox>
  );
}
function MethodologySection() {
  const { t } = useTranslation();
  const metrics = (helpData.metrics as MetricStatic[]).map((m) => ({
    name: m.name,
    formula: m.formula,
    info: t(m.i18nKey, { returnObjects: true }) as MetricInfo,
  }));
  return (
    <HelpSection
      icon={<BookOpen className="size-6 text-brand" />}
      title={t('Backtest Methodology')}
      description={t(
        'This platform uses time-weighted returns (TWR) for backtesting, supporting both periodic and threshold rebalancing modes. All returns are compounded as log returns and converted to annualized metrics.',
      )}
    >
      <HelpGrid>
        {metrics.map((m) => (
          <MetricCard
            key={m.name}
            name={m.name}
            fullName={m.info.fullName}
            formula={m.formula}
            desc={m.info.desc}
          />
        ))}
      </HelpGrid>
      <RebalancingModesInfo />
    </HelpSection>
  );
}
function DataSection() {
  const { t } = useTranslation();
  const sources = t('help.data.sources', { returnObjects: true }) as DataSource[];
  return (
    <HelpSection
      icon={<Database className="size-6 text-brand" />}
      title={t('Data Source')}
      description={t(
        'The platform supports multiple data sources; all data is cached locally in a SQLite database. After the first query, the cache is preferred to reduce API calls.',
      )}
    >
      <HelpGrid>
        {sources.map((s) => (
          <div key={s.name} className="rounded-lg bg-input-bg p-4">
            <div className="mb-1 text-body font-semibold text-fg">{s.name}</div>
            <div className="mb-1.5 text-caption text-brand">{s.scope}</div>
            <div className="text-caption text-fg-tertiary">{s.note}</div>
          </div>
        ))}
      </HelpGrid>
      <HelpInfoBox
        icon={<TrendingUp className="size-4 text-success" />}
        title={t('Data Update Strategy')}
      >
        {t(
          'Prefer incremental updates over full refreshes to avoid triggering third-party API rate limits. The data engine automatically records the last update time and only fetches missing trading days. FX and inflation data are updated monthly.',
        )}
      </HelpInfoBox>
    </HelpSection>
  );
}
function FaqSection() {
  const { t } = useTranslation();
  const faqs = t('help.faq.items', { returnObjects: true }) as FaqItem[];
  return (
    <HelpSection icon={<HelpCircle className="size-6 text-brand" />} title={t('FAQ')}>
      <div className="flex flex-col gap-3">
        {faqs.map((faq, i) => (
          <FaqItemRow key={i} q={faq.q} a={faq.a} />
        ))}
      </div>
    </HelpSection>
  );
}
function MetricCard({
  name,
  fullName,
  formula,
  desc,
}: {
  name: string;
  fullName: string;
  formula: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg bg-input-bg p-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-h3 font-bold text-brand">{name}</span>
        <span className="text-caption text-fg-tertiary">{fullName}</span>
      </div>
      <div className="mb-2 overflow-x-auto rounded bg-elevated px-2.5 py-1.5 font-mono text-caption text-fg">
        {formula}
      </div>
      <div className="text-caption leading-relaxed text-fg-secondary">{desc}</div>
    </div>
  );
}
function FaqItemRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-input-bg px-4 py-3 text-left text-body font-semibold text-fg"
      >
        {q}
        <ChevronDown
          className="size-4 shrink-0 text-fg-tertiary transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && <div className="px-4 py-3 text-label leading-relaxed text-fg-secondary">{a}</div>}
    </div>
  );
}
