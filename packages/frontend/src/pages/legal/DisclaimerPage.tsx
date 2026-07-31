import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import LegalPageLayout, { type LegalSection } from './LegalPageLayout.js';
const SECTION_KEYS = ['riskDisclosure', 'survivorshipBias', 'backtestLimitations', 'dataSource'] as const;
export default function DisclaimerPage() {
  const { t } = useTranslation();
  const sections: LegalSection[] = SECTION_KEYS.map((key) => ({
    title: t(`legal.disclaimer.sections.${key}.title`),
    body: t(`legal.disclaimer.sections.${key}.body`, { returnObjects: true }) as string[]
  }));
  return (
    <LegalPageLayout title={t('legal.disclaimer.title')} lastUpdated={t('legal.disclaimer.lastUpdated')} intro={t('legal.disclaimer.intro')} sections={sections}>
      <div className="mt-6 rounded-lg bg-input-bg p-4 text-label text-fg-tertiary">
        {t('legal.disclaimer.methodologyPrefix')}{' '}
        <Link to="/help" className="text-brand hover:underline">
          {t('legal.disclaimer.methodologyLink')}
        </Link>
        {t('legal.disclaimer.methodologySuffix')}
      </div>
    </LegalPageLayout>
  );
}
