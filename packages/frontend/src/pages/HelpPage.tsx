/**
 * @file 帮助/方法论页面
 * @description 回测计算方法、指标定义、数据来源说明、常见问题 FAQ
 * @route /help
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Database, HelpCircle, ChevronDown, Calculator, TrendingUp } from 'lucide-react';
import { StandardPageShell } from '../components/shells/StandardPageShell.js';
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

  const tabs: { key: Section; label: string; icon: React.ReactNode }[] = [
    {
      key: 'methodology',
      label: t('help.tabs.methodology'),
      icon: <Calculator className="w-4 h-4" />,
    },
    { key: 'data', label: t('help.tabs.data'), icon: <Database className="w-4 h-4" /> },
    { key: 'faq', label: t('help.tabs.faq'), icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <StandardPageShell config={{ titleKey: 'help.title' }}>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        {/* Tab 切换 */}
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
    </StandardPageShell>
  );
}

/** 帮助页面区块容器：统一渲染图标标题、描述与子内容 */
function HelpSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {icon}
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</div>
      </div>
      {description && (
        <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 20 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  );
}

/** 帮助页面卡片网格容器（自适应列布局） */
function HelpGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}

/** 帮助页面信息提示框（统一样式：subtle 背景 + 圆角 + 标题/图标头） */
function HelpInfoBox({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        fontSize: 13,
        color: 'var(--text-body)',
      }}
    >
      {(title || icon) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {icon}
          {title && <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{title}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** 调仓模式说明区块 */
function RebalancingModesInfo() {
  const { t } = useTranslation();
  return (
    <HelpInfoBox title={t('help.methodology.rebalModesTitle')}>
      <div style={{ marginBottom: 6 }}>
        <strong>{t('help.methodology.rebalModes.periodic')}</strong>
      </div>
      <div style={{ marginBottom: 6 }}>
        <strong>{t('help.methodology.rebalModes.threshold')}</strong>
      </div>
      <div>
        <strong>{t('help.methodology.rebalModes.buyHold')}</strong>
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
      icon={<BookOpen className="w-6 h-6" style={{ color: 'var(--brand)' }} />}
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

function DataSection() {
  const { t } = useTranslation();
  const sources = t('help.data.sources', { returnObjects: true }) as DataSource[];

  return (
    <HelpSection
      icon={<Database className="w-6 h-6" style={{ color: 'var(--brand)' }} />}
      title={t('help.data.title')}
      description={t('help.data.desc')}
    >
      <HelpGrid>
        {sources.map((s) => (
          <div
            key={s.name}
            style={{
              padding: 16,
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-control)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-strong)',
                marginBottom: 4,
              }}
            >
              {s.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--brand)', marginBottom: 6 }}>{s.scope}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.note}</div>
          </div>
        ))}
      </HelpGrid>

      <HelpInfoBox
        icon={<TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} />}
        title={t('help.data.updateStrategyTitle')}
      >
        {t('help.data.updateStrategyContent')}
      </HelpInfoBox>
    </HelpSection>
  );
}

function FaqSection() {
  const { t } = useTranslation();
  const faqs = t('help.faq.items', { returnObjects: true }) as FaqItem[];

  return (
    <HelpSection
      icon={<HelpCircle className="w-6 h-6" style={{ color: 'var(--brand)' }} />}
      title={t('help.faq.title')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {faqs.map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
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
    <div
      style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand)' }}>{name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fullName}</span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontFamily: 'monospace',
          color: 'var(--text-strong)',
          background: 'var(--bg-elevated)',
          padding: '6px 10px',
          borderRadius: 4,
          marginBottom: 8,
          overflowX: 'auto',
        }}
      >
        {formula}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-body)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-control)',
        overflow: 'hidden',
      }}
    >
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
        <ChevronDown
          className="w-4 h-4"
          style={{
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div
          style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-body)', lineHeight: 1.7 }}
        >
          {a}
        </div>
      )}
    </div>
  );
}
