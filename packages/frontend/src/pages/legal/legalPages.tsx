import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import LegalPageLayout, { type LegalSection } from './LegalPageLayout.js';

/** 法律页共享骨架（SMALL3 合并：Terms/Privacy/Disclaimer 三页同构，仅 section 键与 i18n 前缀不同） */
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
        {t('legal.disclaimer.methodologyPrefix')}{' '}
        <Link to="/help" className="text-brand hover:underline">
          {t('legal.disclaimer.methodologyLink')}
        </Link>
        {t('legal.disclaimer.methodologySuffix')}
      </div>
    </LegalPage>
  );
}
