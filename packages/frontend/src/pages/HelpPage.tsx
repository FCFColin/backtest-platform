/**
 * @file 帮助/方法论页面
 * @description 回测计算方法、指标定义、数据来源说明、常见问题 FAQ
 * @route /help
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Database, HelpCircle, ChevronDown, Calculator, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
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

/**
 * HelpPage: 帮助页面，含方法论/数据/FAQ 三个子栏目。
 * @returns 渲染的帮助页面。
 */
export default function HelpPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('methodology');

  const tabs: { key: Section; label: string; icon: ReactNode }[] = [
    {
      key: 'methodology',
      label: t('help.tabs.methodology'),
      icon: <Calculator className="size-4" />,
    },
    { key: 'data', label: t('help.tabs.data'), icon: <Database className="size-4" /> },
    { key: 'faq', label: t('help.tabs.faq'), icon: <HelpCircle className="size-4" /> },
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t('help.title')}</h1>
      <Card className="p-6">
        <div className="mb-6 flex gap-2 border-b-2 border-subtle pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                section === tab.key
                  ? 'bg-brand/10 text-brand'
                  : 'text-fg-tertiary hover:text-fg-secondary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {section === 'methodology' && <MethodologySection />}
        {section === 'data' && <DataSection />}
        {section === 'faq' && <FaqSection />}
      </Card>
    </div>
  );
}

/** HelpSection: 区块容器，渲染图标标题、描述与子内容 */
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

/** HelpGrid: 卡片网格容器（自适应列布局） */
function HelpGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
      {children}
    </div>
  );
}

/** HelpInfoBox: 信息提示框（subtle 背景 + 圆角 + 标题/图标头） */
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
    <div className="rounded-lg bg-input-bg p-4 text-[13px] text-fg-secondary">
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

/** RebalancingModesInfo: 调仓模式说明区块 */
function RebalancingModesInfo() {
  const { t } = useTranslation();
  return (
    <HelpInfoBox title={t('help.methodology.rebalModesTitle')}>
      <div className="mb-1.5">
        <strong>{t('help.methodology.rebalModes.periodic')}</strong>
      </div>
      <div className="mb-1.5">
        <strong>{t('help.methodology.rebalModes.threshold')}</strong>
      </div>
      <div>
        <strong>{t('help.methodology.rebalModes.buyHold')}</strong>
      </div>
    </HelpInfoBox>
  );
}

/** MethodologySection: 方法论 + 指标卡片 */
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
      title={t('help.methodology.title')}
      description={t('help.methodology.desc')}
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

/** DataSection: 数据来源 + 更新策略 */
function DataSection() {
  const { t } = useTranslation();
  const sources = t('help.data.sources', { returnObjects: true }) as DataSource[];

  return (
    <HelpSection
      icon={<Database className="size-6 text-brand" />}
      title={t('help.data.title')}
      description={t('help.data.desc')}
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
        title={t('help.data.updateStrategyTitle')}
      >
        {t('help.data.updateStrategyContent')}
      </HelpInfoBox>
    </HelpSection>
  );
}

/** FaqSection: 常见问题列表 */
function FaqSection() {
  const { t } = useTranslation();
  const faqs = t('help.faq.items', { returnObjects: true }) as FaqItem[];

  return (
    <HelpSection icon={<HelpCircle className="size-6 text-brand" />} title={t('help.faq.title')}>
      <div className="flex flex-col gap-3">
        {faqs.map((faq, i) => (
          <FaqItemRow key={i} q={faq.q} a={faq.a} />
        ))}
      </div>
    </HelpSection>
  );
}

/** MetricCard: 指标卡片 */
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

/** FaqItemRow: 可展开 FAQ 条目 */
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
      {open && (
        <div className="px-4 py-3 text-[13px] leading-relaxed text-fg-secondary">{a}</div>
      )}
    </div>
  );
}
