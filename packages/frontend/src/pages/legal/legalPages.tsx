import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/uiComponents';
interface LegalSection {
  title: string;
  body: string[];
}
interface LegalPageLayoutProps {
  title: string;
  lastUpdated?: string;
  intro?: string;
  sections: LegalSection[];
  children?: ReactNode;
}
function LegalPageLayout({ title, lastUpdated, intro, sections, children }: LegalPageLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{title}</h1>
      {lastUpdated && <p className="text-caption text-fg-tertiary">{lastUpdated}</p>}
      <Card className="p-6">
        {intro && <p className="mb-6 text-body leading-loose text-fg-secondary">{intro}</p>}
        <div className="flex flex-col gap-6">
          {sections.map((section, idx) => (
            <section key={idx}>
              <h2 className="mb-2 text-h3 font-bold text-fg">{section.title}</h2>
              {section.body.map((paragraph, pIdx) => (
                <p key={pIdx} className="mb-2 text-body leading-loose text-fg-secondary last:mb-0">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        {children}
      </Card>
    </div>
  );
}

function LegalPage({
  prefix,
  sectionKeys,
  children,
}: {
  prefix: string;
  sectionKeys: readonly string[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const sections: LegalSection[] = sectionKeys.map((key) => ({
    title: t(`legal.${prefix}.sections.${key}.title`),
    body: t(`legal.${prefix}.sections.${key}.body`, { returnObjects: true }) as string[],
  }));
  return (
    <LegalPageLayout
      title={t(`legal.${prefix}.title`)}
      lastUpdated={t(`legal.${prefix}.lastUpdated`)}
      intro={t(`legal.${prefix}.intro`)}
      sections={sections}
    >
      {children}
    </LegalPageLayout>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPage prefix="terms" sectionKeys={['acceptance', 'license', 'disclaimer', 'liability']} />
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      prefix="privacy"
      sectionKeys={['dataCollection', 'dataUse', 'dataRetention', 'cookiePolicy']}
    />
  );
}

export function DisclaimerPage() {
  const { t } = useTranslation();
  return (
    <LegalPage
      prefix="disclaimer"
      sectionKeys={['riskDisclosure', 'survivorshipBias', 'backtestLimitations', 'dataSource']}
    >
      <div className="mt-6 rounded-lg bg-input-bg p-4 text-label text-fg-tertiary">
        {t(
          'For detailed information about data processing methodology and survivorship bias, please refer to the',
        )}{' '}
        <Link to="/help" className="text-brand hover:underline">
          {t('Methodology documentation')}
        </Link>
        {t('.')}
      </div>
    </LegalPage>
  );
}
